import https from "https";
import http, { ClientRequest } from "http";
import { pipeline } from "stream";
import { ProxyUtils } from "../../utils/ProxyUtils";
import type { RequestScope } from "../../scope/types";
import { pluginEventManager } from "../../event/plugin-events/pluginEvents";

export class UpstreamInitiator {
  private static httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 5000,
    maxSockets: 1024,
    maxFreeSockets: 256,
    scheduling: "fifo",
    timeout: 60000,
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined,
  });

  private static httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 5000,
    maxSockets: 1024,
    maxFreeSockets: 256,
    scheduling: "fifo",
    timeout: 60000,
  });

  public static async initH1UpstreamReq(targetUrl: URL, scope: RequestScope) {
    const { request } = scope;
    const clientReq = request.client.req;

    if (!clientReq) {
      throw new Error("Client request is missing");
    }

    const isHTTPS = targetUrl.protocol === "https:";
    const requestModule = isHTTPS ? https : http;
    const agent = isHTTPS ? this.httpsAgent : this.httpAgent;

    let upstream: ClientRequest;

    try {
      upstream = requestModule.request({
        host: targetUrl.hostname,
        port: targetUrl.port || (isHTTPS ? 443 : 80),

        servername: isHTTPS ? targetUrl.hostname : undefined,

        method: clientReq.method,

        path: targetUrl.pathname + targetUrl.search,

        headers: {
          ...clientReq.headers,
          host: targetUrl.host,
          connection: "keep-alive",
        },

        agent,

        timeout: 30000,

        maxHeaderSize: 128 * 1024,
      });
    } catch (syncError) {
      console.error(
        "[Outbound Bridge Critical] Synchronous request instantiation failed:",
        syncError,
      );
      clientReq.destroy();
      this.handleUpstreamFailure(syncError as Error, scope, targetUrl);
      throw syncError;
    }

    // Disable Nagle's algorithm for lower latency
    upstream.setNoDelay(true);

    upstream.once("socket", (socket) => {
      if (socket.connecting) {
        const connectEvent = isHTTPS ? "secureConnect" : "connect";
        socket.once(connectEvent, async () => {
          await pluginEventManager.emitAsync("proxy:upstream-connect", {
            scope,
          });
        });
      } else {
        setImmediate(async () => {
          await pluginEventManager.emitAsync("proxy:upstream-connect", {
            scope,
          });
        });
      }
    });

    upstream.once("finish", async () => {
      await pluginEventManager.emitAsync("proxy:upstream-request", { scope });
    });

    const onClientClose = () => {
      if (upstream && !upstream.destroyed) {
        upstream.destroy();
      }
    };

    request.client.res?.once("close", onClientClose);

    pipeline(clientReq, upstream, (err) => {
      request.client.res?.removeListener("close", onClientClose);

      if (err) {
        const errCode = (err as NodeJS.ErrnoException).code;
        // Ignore pipeline errors caused by expected client disconnections
        if (
          errCode !== "ERR_STREAM_PREMATURE_CLOSE" &&
          err.message !== "ERR_CLIENT_DISCONNECTED"
        ) {
          console.error(
            "Pipeline mapping failed from client to upstream:",
            err,
          );
          this.handleUpstreamFailure(err, scope, targetUrl);
        }
      }
    });

    return upstream;
  }

  /**
   * Unified Pipeline Failure/Error Reporting Logic
   */
  private static handleUpstreamFailure(
    err: Error,
    scope: RequestScope,
    targetUrl: URL,
  ): void {
    const { request } = scope;

    console.error(
      `[Stream Error] Upstream Pathway Fault: ${err.message} | host: ${targetUrl.host}`,
    );

    const res = request.client.res;

    if (res && !res.headersSent && !res.writableEnded) {
      res.statusCode = 502;
      res.end("Bad Gateway");
    }

    ProxyUtils.cleanUp([request.client.req?.socket!]);
  }
}
