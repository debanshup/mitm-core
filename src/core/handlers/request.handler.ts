import https from "https";
import http from "http";
import { Phase } from "../../core/phase/Phase.ts";
import { BaseHandler } from "./base/base.handler.ts";
import type { ProxyContext } from "../types/types.ts";
import { pipeline } from "stream";

export class RequestHandler extends BaseHandler {
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
        // timeout: 30000,
      },
      (upstreamRes) => {
        ctx.upstreamRes = upstreamRes;
        // if headers were already sent by plugins
        if (res.writableEnded) {
          return;
        }
        res.writeHead(upstreamRes.statusCode || 500, upstreamRes.headers);
        // Pipe Upstream Response -> Client
        pipeline(upstreamRes, res, (err) => {
          if (err) {
            console.error(`[Stream Error] Upstream -> Client: ${err}`);
            res.destroy();
            upstream.destroy();
          }
        });
      }
    );
    // disable nagle's
    upstream.setNoDelay(true);

    // upstream.on("timeout", ()=>{})

    upstream.on("error", (e) => {
      console.error(`[Upstream Error](${e}) for ${targetUrl.href}`);

      if (!res.headersSent) {
        res.setHeader("Connection", "close");
        res.statusCode = 502; // Bad Gateway
        res.end();
        console.error(res.statusCode, "Sent to client for ->", res.req.url);
      } else {
        res.destroy();
      }
      if (!upstream.destroyed) {
        upstream.destroy();
        console.info("Upstream destroyed for ->", res.req.url);
      }
    });
    upstream.on("close", () => {
      if (!upstream.destroyed) {
        upstream.destroy();
      }
    });

    // Pipe Client Request -> Upstream Server

    pipeline(req, upstream, (err) => {
      if (err) {
        console.error(`[Stream Error] Client -> Upstream: ${err.message}`);
        upstream.destroy();
      }
    });
  }
}
