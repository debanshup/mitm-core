import https from "https";
import http from "http";
import { Phase } from "../../phase/Phase.ts";
import { BaseHandler } from "./base/base.handler.ts";
import type { ProxyContext } from "../../types/types.ts";
import { pipeline } from "stream";
import { ProxyUtils } from "../utiils/ProxyUtils.ts";
import { STATE } from "../state/state.ts";
import { ResponseCache } from "../cache-manager/ResponseCache.ts";

export class RequestHandler extends BaseHandler {
  static phase = Phase.REQUEST;
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

  static async handle(ctx: ProxyContext) {
    const { requestContext } = ctx;
    if (!requestContext?.req) {
      console.info("REQ not found!");
      return;
    }
    // console.info("running req handler...");
    let targetUrl: URL;

    try {
      if (ctx.proxyToUpstreamUrl) {
        targetUrl = new URL(ctx.proxyToUpstreamUrl);
      } else {
        // fail safe
        if (requestContext.req.url?.startsWith("http")) {
          targetUrl = new URL(requestContext!.req.url);
        } else {
          targetUrl = new URL(
            requestContext!.req.url || "/",
            `https://${requestContext.req.headers.host}`,
          );
        }
      }
    } catch (error) {
      console.error(
        "Invalid URL:",
        ctx.proxyToUpstreamUrl || requestContext.req.url,
      );
      requestContext.res!.statusCode = 400;
      requestContext.res!.end("Invalid URL");
      return;
    }

    // console.info(targetUrl)

    const isHTTPS = targetUrl.protocol === "https:";
    const requestModule = isHTTPS ? https : http;
    const agent = isHTTPS ? this.httpsAgent : this.httpAgent;
    const cache_key = ResponseCache.generateKey(requestContext.req);
    const cached = ResponseCache.get(cache_key);

    if (cached?.etag) {
      requestContext.req!.headers.etag = cached.etag;
    }

    const upstream = requestModule.request({
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
    });
    // disable nagle's
    upstream.setNoDelay(true);
    requestContext.upstreamReq = upstream;

    // Pipe Client Request -> Upstream Server
    pipeline(requestContext.req, upstream, (err) => {
      if (err) {
        console.error(`[Stream Error] Client -> Upstream: ${err.message}`);
        if (requestContext.res && !requestContext.res.headersSent) {
          requestContext.res!.setHeader("Connection", "close");
          requestContext.res!.statusCode = 502; // Bad Gateway
          requestContext.res!.end("Bad Gateway");
          // console.info("HTTPS", isHTTPS);
          console.error(
            // requestContext.res!.statusCode,
            // "Sent to client for ",
            // targetUrl.href,
            // "err:",
            err,
          );
        }
        ProxyUtils.cleanUp([upstream, requestContext.req?.socket!]);
        requestContext.state.set(STATE.is_error, true);
      }
    });
    requestContext.nextPhase = Phase.RESPONSE;
    // await Pipeline.run(ctx);
  }
}
