import https from "https";
import http from "http";
import { pipeline } from "stream";
import http2 from "http2";
import { ProxyUtils } from "../../utils/ProxyUtils";
import type { RequestScope } from "../../context-manager/types";

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
      return this.initH1Upstream(targetUrl, scope);
      // return this.initH2Upstream(targetUrl, scope);
    } else {
      // implement for other h versions
    }
  }

  public static async initH1Upstream(targetUrl: URL, scope: RequestScope) {
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
      headers: {
        ...requestContext.req?.headers,
        host: targetUrl.hostname,
        connection: "keep-alive",
      },
      agent,
      timeout: 20000,
    });``
    // disable nagle's
    upstreamReq.setNoDelay(true);
    requestContext.upstreamReq = upstreamReq;

    // Pipe Client Request -> Upstream Server
    pipeline(requestContext.req!, upstreamReq, (err) => {
      if (err) {
        this.handleUpstreamFailure(err, scope, targetUrl, upstreamReq);
      }
    });
  }

  /**
   *
   * @param targetUrl
   * @param context
   * @description
   * Initiates h2 upstream
   */

  // static initH2Upstream(targetUrl: URL, scope: RequestScope) {
  //   const { requestContext, sessionContext } = scope;

  //   const downstreamStream = requestContext.h2Stream!;
  //   const headers = sessionContext.sanitizedHeaders ?? {};

  //   // Reuse upstream session
  //   if (
  //     !sessionContext.h2UpstreamSession ||
  //     sessionContext.h2UpstreamSession.destroyed ||
  //     sessionContext.h2UpstreamSession.closed
  //   ) {
  //     sessionContext.h2UpstreamSession = http2.connect(targetUrl.origin);

  //     sessionContext.h2UpstreamSession.on("error", (err) => {
  //       this.handleUpstreamFailure(
  //         err,
  //         scope,
  //         targetUrl,
  //         sessionContext.h2UpstreamSession,
  //       );
  //     });

  //     sessionContext.h2UpstreamSession.on("goaway", () => {
  //       sessionContext.h2UpstreamSession?.close();
  //     });
  //   }

  //   const upstreamStream = sessionContext.h2UpstreamSession.request({
  //     ...headers,

  //     ":scheme": targetUrl.protocol.replace(":", ""),
  //     ":authority": targetUrl.host,
  //     ":path": headers[":path"] ?? targetUrl.pathname + targetUrl.search,
  //   });

  //   requestContext.h2UpstreamStream = upstreamStream;

  //   upstreamStream.on("response", (upstreamHeaders) => {
  //     downstreamStream.respond(upstreamHeaders);
  //   });

  //   upstreamStream.on("error", (err) => {
  //     this.handleUpstreamFailure(
  //       err as Error,
  //       scope,
  //       targetUrl,
  //       upstreamStream,
  //     );
  //   });

  //   pipeline(downstreamStream, upstreamStream, (err) => {
  //     if (err) {
  //       this.handleUpstreamFailure(err, scope, targetUrl, upstreamStream);
  //     }
  //   });

  //   pipeline(upstreamStream, downstreamStream, (err) => {
  //     if (err) {
  //       this.handleUpstreamFailure(err, scope, targetUrl, upstreamStream);
  //     }
  //   });
  // }
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
    console.error(`[Stream Error] Upstream Pathway Fault: ${err.message}`);

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
