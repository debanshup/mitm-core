import https from "https";
import http from "http";
import { Phase } from "../../core/phase/Phase.ts";
import { STATE, type ProxyContext } from "../../middleware/middleware.ts";
import { BasePlugin } from "../BasePlugin.ts";

export default class RequestPlugin extends BasePlugin {
  static order = 25;
  static phase = Phase.REQUEST;
  private static httpsAgent = new https.Agent({
    keepAlive: true, // Keep sockets open for reuse
    keepAliveMsecs: 1000, // send TCP keep-alive packets every 1s
    maxSockets: Infinity, // Allow unlimited concurrent connections per host
    maxFreeSockets: 256, // Allow plenty of idle sockets to stay open
    timeout: 30000, // Close socket if idle for 30s (avoids stale connection errors)
    scheduling: "lifo", // Use most recently used socket (better for reused connections)
    // ciphers: [
    //   "TLS_AES_128_GCM_SHA256",
    //   "TLS_AES_256_GCM_SHA384",
    //   "TLS_CHACHA20_POLY1305_SHA256",
    //   "ECDHE-ECDSA-AES128-GCM-SHA256",
    //   "ECDHE-RSA-AES128-GCM-SHA256",
    //   "ECDHE-ECDSA-AES256-GCM-SHA384",
    //   "ECDHE-RSA-AES256-GCM-SHA384",
    //   "ECDHE-ECDSA-CHACHA20-POLY1305",
    //   "ECDHE-RSA-CHACHA20-POLY1305",
    //   "ECDHE-RSA-AES128-SHA",
    //   "ECDHE-RSA-AES256-SHA",
    //   "AES128-GCM-SHA256",
    //   "AES256-GCM-SHA384",
    //   "AES128-SHA",
    //   "AES256-SHA",
    // ].join(":"),
    // ecdhCurve: "auto",
  });

  private static httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: Infinity,
    maxFreeSockets: 256,
    timeout: 30000,
    scheduling: "lifo",
  });
  static async execute(ctx: ProxyContext) {
    // console.info("CONNECT_HANDLED", ctx.state.get(STATE.CONNECT_HANDLED))

    // console.info(ctx.req?.headers.host)
    const { req, res } = ctx;

    if (!req || !res) {
      return;
    }

    let targetUrl: URL;

    try {
      if (req.url?.startsWith("http")) {
        targetUrl = new URL(req.url);
      } else {
        targetUrl = new URL(req.url || "/", `https://${req.headers.host}`);
      }
    } catch (error) {
      console.error("Invalid URL:", req.url);
      res.statusCode = 400;
      res.end("Invalid URL");
      return;
    }

    // console.info(targetUrl);

    const isHTTPS = targetUrl.protocol === "https:";
    const requestModule = isHTTPS ? https : http;
    const agent = isHTTPS ? this.httpsAgent : this.httpAgent;
    // console.info("same", targetUrl.pathname+ targetUrl.search === req.url) -> true
    // console.info("url ABS",req.url);
    // console.info("url NORM",targetUrl.pathname+ targetUrl.search);
    const upstream = requestModule.request(
      {
        host: targetUrl.hostname,
        port: targetUrl.port || (isHTTPS ? 443 : 80),
        method: req?.method,
        path: req?.url,
        headers: {
          ...req?.headers,
          host: targetUrl.hostname,
          connection: "keep-alive",
        },
        agent,
      },
      (upstreamRes) => {
        ctx.upstreamRes = upstreamRes;
        res!.writeHead(upstreamRes.statusCode || 500, upstreamRes.headers);
        ctx.res = res;
        //  await Pipeline.run(Phase.REQUEST, ctx); within try-catch

        // send response back to client
        upstreamRes.pipe(res!);
        upstreamRes.on("close", () => {
          if (!upstream.destroyed) {
            upstream.destroy();
          }
        });
      }
    );
    // disable nagle's
    upstream.setNoDelay(true);

    upstream.on("error", (e) => {
      console.error(`Upstream Error (${e.name}) for ${targetUrl.href}`);

      if (!res.headersSent) {
        res.statusCode = 502; // Bad Gateway
        res.end();
      }
      if (!upstream.destroyed) {
        upstream.destroy();
      }
    });
    upstream.on("close", () => {
      if (!upstream.destroyed) {
        upstream.destroy();
      }
    });

    req?.pipe(upstream);
  }
}
