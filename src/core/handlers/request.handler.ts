import https from "https";
import http, { IncomingMessage } from "http";
import { Phase } from "../../core/phase/Phase.ts";
import { BaseHandler } from "./base/base.handler.ts";
import type { ProxyContext } from "../types/types.ts";
import { pipeline } from "stream";
import { ProxyUtils } from "../utiils/ProxyUtils.ts";
import { STATE } from "../state/state.ts";

import Pipeline from "../pipelines/PipelineCompiler.ts";
import type { Socket } from "net";

// import pipeline_agent from "../agent/pipeline.ts";
export class RequestHandler extends BaseHandler {
  // static order = 25;
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

  // bridge

  // private static bridge(source: Duplex, destination: Duplex) {
  //   let destroyed = false;
  //   pipeline(source, destination, (err) => {
  //     if (err) {
  //       if (destroyed) {
  //         return;
  //       }

  //       source.destroy();
  //       destination.destroy();
  //       destroyed = true;
  //     }
  //   });
  // }

  // clean up

  static async handle(ctx: ProxyContext) {
    const { reqCtx } = ctx;
    // console.info(reqCtx!.state.get(STATE.finished))
    // const { req, res } = reqCtx;

    if (!reqCtx?.req) {
      console.info("REQ not found!");
      return;
    }
    // console.info("running req handler...");

    let targetUrl: URL;

    try {
      if (reqCtx.req.url?.startsWith("http")) {
        targetUrl = new URL(reqCtx!.req.url);
      } else {
        targetUrl = new URL(
          reqCtx!.req.url || "/",
          `https://${reqCtx.req.headers.host}`
        );
      }
    } catch (error) {
      console.error("Invalid URL:", reqCtx.req.url);
      reqCtx.res!.statusCode = 400;
      reqCtx.res!.end("Invalid URL");
      return;
    }

    // console.info(targetUrl);

    const isHTTPS = targetUrl.protocol === "https:";
    const requestModule = isHTTPS ? https : http;
    const agent = isHTTPS ? this.httpsAgent : this.httpAgent;
    // console.info("creating upstream");
    const upstream = requestModule.request(
      {
        host: targetUrl.hostname,
        port: targetUrl.port || (isHTTPS ? 443 : 80),
        method: reqCtx.req?.method,
        path: reqCtx.req?.url,
        headers: {
          ...reqCtx.req?.headers,
          host: targetUrl.hostname,
          connection: "keep-alive",
        },
        agent,
        timeout: 20000,
      },
      (upstreamRes) => {
        // console.info("upstream res");
        reqCtx.upstreamRes = upstreamRes;
        // console
        //   .info
        //   // "STATUS for",targetUrl.host,upstreamRes.statusCode,"\n", "[Headers]:",upstreamRes.headers
        //   ();
        // upstreamRes.on("end", () => {
        //   reqCtx.res!.end();
        //   upstreamRes.socket?.destroy();
        //   reqCtx.state.set(STATE.finished, true);
        // });
        upstreamRes.on("close", (hadErr: boolean) => {
          ProxyUtils.cleanUp([upstreamRes, upstream]);
          if (hadErr) {
            reqCtx.state.set(STATE.is_error, true);
            return;
          }
          // console.log("Upstream fully closed for:", targetUrl.host);
          reqCtx.state.set(STATE.finished, true);
        });

        // if headers were already sent by plugins
        if (reqCtx.res!.writableEnded) {
          return;
        }
        reqCtx.res!.writeHead(
          upstreamRes.statusCode || 500,
          upstreamRes.headers
        );
        // Pipe Upstream Response -> Client
        // upstreamRes.on("data", () => {});

        pipeline(upstreamRes, reqCtx.res!, (err) => {
          if (err) {
            if (err && !["ECONNRESET", "EPIPE"].includes((err as any).code)) {
              console.error("Bridge Error:", err);
            }
            ProxyUtils.cleanUp([upstreamRes]);
            reqCtx.state.set(STATE.is_error, true);
          }
        });
      }
    );
    // disable nagle's
    upstream.setNoDelay(true);

    // early guard
    // req.once("error", (err) => {
    //   console.error("[req error]", err.message, req.url, targetUrl.href);
    //   ProxyUtils.cleanUp([req, res, upstream, ctx.upstreamRes!, req.socket]);
    // });
    // res.once("error", (err) => {
    //   console.error("[res error]", err.message, req.url, targetUrl.href);
    //   ProxyUtils.cleanUp([req, res, upstream, ctx.upstreamRes!, req.socket]);
    // });

    // Pipe Client Request -> Upstream Server

    pipeline(reqCtx.req, upstream, (err) => {
      if (err) {
        console.error(`[Stream Error] Client -> Upstream: ${err.message}`);
        ProxyUtils.cleanUp([upstream, ctx.socket!]);
        reqCtx.state.set(STATE.is_error, true);
      }
    });

    // upstream.on("timeout", ()=>{})

    upstream.on("error", (e) => {
      console.error(`[Upstream Error](${e}) for ${targetUrl.href}`);

      if (reqCtx.res && !reqCtx.res.headersSent) {
        reqCtx.res!.setHeader("Connection", "close");
        reqCtx.res!.statusCode = 502; // Bad Gateway
        reqCtx.res!.end("Bad Gateway");
        console.error(
          reqCtx.res!.statusCode,
          "Sent to client for ->",
          targetUrl.host
        );
      }
      reqCtx.state.set(STATE.is_error, true);
    });
    upstream.on("close", (hadErr: boolean) => {
      ProxyUtils.cleanUp([upstream]);
      reqCtx.state.set(STATE.finished, true);
    });

    // setTimeout(() => {
    //   if (!ctx.socket!.destroyed) {
    //     console.log("⚠️ [upstream_side] leaked socket (likely CLOSE_WAIT) for", targetUrl.host);
    //     ctx.socket!.destroy();
    //   }
    // }, 30000);
  }
}
