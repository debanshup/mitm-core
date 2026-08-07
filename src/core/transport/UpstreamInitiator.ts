import https from "https";
import http from "http";
import { pipeline } from "stream";
import { ProxyUtils } from "../utils/ProxyUtils";
import type { RequestScope } from "../context-manager/types";
import { pluginEventManager } from "../event-manager/plugin-events/pluginEvents";

export class UpstremInitiator {
  private static httpsAgent = new https.Agent({
    keepAlive: true, // Keep sockets open for reuse
    keepAliveMsecs: 1000, // send TCP keep-alive packets every 1s
    maxSockets: Infinity, // Allow unlimited concurrent connections per host
    maxFreeSockets: 256, // Allow plenty of idle sockets to stay open
    timeout: 30000, // Close socket if idle for 30s (avoids stale connection errors)
    scheduling: "lifo", // Use most recently used socket (better for reused connections)
  });

  private static httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: Infinity,
    maxFreeSockets: 256,
    timeout: 30000,
    scheduling: "lifo",
  });

  public static async init(targetUrl: URL, scope: RequestScope) {
    const { sessionContext } = scope;
    // Branch execution dynamically based on negotiated protocol version
    if (sessionContext.httpVersion === "h1") {
      const h1UpstreamReq = await this.initH1UpstreamReq(targetUrl, scope);
      return h1UpstreamReq;
    } else {
      // implement for other h versions
    }

    //
  }

  public static async initH1UpstreamReq(targetUrl: URL, scope: RequestScope) {
    const { requestContext } = scope;
    const isHTTPS = targetUrl.protocol === "https:";
    const requestModule = isHTTPS ? https : http;

    // console.info(requestModule.name, targetUrl.host)

    const agent = isHTTPS ? this.httpsAgent : this.httpAgent;
    const upstreamReq = requestModule.request({
      host: targetUrl.hostname,
      port: targetUrl.port || (isHTTPS ? 443 : 80),
      method: requestContext.req?.method,
      path: requestContext.req?.url,
      // family: 4,
      headers: {
        ...requestContext.req?.headers,
        host: targetUrl.hostname,
        connection: "keep-alive",
      },
      agent,
      timeout: 20000,
    });

    // disable nagle's
    upstreamReq.setNoDelay(true);

    upstreamReq.once("socket", (socket) => {
      // If it's a fresh connection, wait for it to be fully established or TLS-handshaked.
      // If it's an existing pooled socket from keep-alive, 'connecting' will be false, and it's ready.
      if (socket.connecting) {
        const connectEvent = isHTTPS ? "secureConnect" : "connect";
        socket.once(connectEvent, async () => {
          await pluginEventManager.emitAsync("proxy:upstream-connect", {
            scope,
          });
        });
      } else {
        // Pooled/Reused connection is already open; fire instantly in a macro-task block
        setImmediate(async () => {
          await pluginEventManager.emitAsync("proxy:upstream-connect", {
            scope,
          });
        });
      }
    });

    upstreamReq.once("finish", async () => {
      await pluginEventManager.emitAsync("proxy:upstream-request", { scope });
    });

    // Pipe Client Request -> Upstream Server
    pipeline(requestContext.req!, upstreamReq, (err) => {
      if (err) {
        console.info(err);
        this.handleUpstreamFailure(err, scope, targetUrl, upstreamReq);
      }
    });

    // Pipe Client Request -> Upstream Server
    pipeline(requestContext.req!, upstreamReq, (err) => {
      if (err) {
        console.info(err);
        this.handleUpstreamFailure(err, scope, targetUrl, upstreamReq);
      }
    });

    
    return upstreamReq;
  }

  /**
   * Unified Pipeline Failure/Error Reporting Logic
   */
  private static handleUpstreamFailure(
    err: Error,
    scope: RequestScope,
    targetUrl: URL,
    upstreamRef: any,
  ) {
    const { requestContext, sessionContext } = scope;
    console.error(`[Stream Error] Upstream Pathway Fault: ${err}`);
    console.info(targetUrl.href);

    if (requestContext.res && !requestContext.res.headersSent) {
      // Treat H1 vs H2 response terminations safely
      if (sessionContext.httpVersion === "h2") {
        if ("rstCode" in requestContext.res) {
          (requestContext.res as any).destroy(err);
        }
      } else {
        requestContext.res.setHeader("Connection", "close");
        requestContext.res.statusCode = 502;
        requestContext.res.end("Bad Gateway");
      }
    }

    if (upstreamRef && typeof upstreamRef.destroy === "function") {
      upstreamRef.destroy();
    }

    ProxyUtils.cleanUp([requestContext.req?.socket!]);
    // requestContext.state.set(, true);
  }
}
