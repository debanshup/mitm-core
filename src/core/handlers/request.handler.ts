import https from "https";
import http from "http";
import { Phase } from "../../core/phase/Phase.ts";
import { BaseHandler } from "./base/base.handler.ts";
import type { ProxyContext } from "../types/types.ts";
import { pipeline } from "stream";
import { ProxyUtils } from "../utiils/ProxyUtils.ts";
import { STATE } from "../state/state.ts";
import Pipeline from "../pipelines/PipelineCompiler.ts";

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

  static async handle(ctx: ProxyContext) {
    const { reqCtx } = ctx;
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
          `https://${reqCtx.req.headers.host}`,
        );
      }
    } catch (error) {
      console.error("Invalid URL:", reqCtx.req.url);
      reqCtx.res!.statusCode = 400;
      reqCtx.res!.end("Invalid URL");
      return;
    }

    const isHTTPS = targetUrl.protocol === "https:";
    const requestModule = isHTTPS ? https : http;
    const agent = isHTTPS ? this.httpsAgent : this.httpAgent;


    
    const upstream = requestModule.request({
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
    });
    // disable nagle's
    upstream.setNoDelay(true);
    reqCtx.upstream = upstream;

    // Pipe Client Request -> Upstream Server
    pipeline(reqCtx.req, upstream, (err) => {
      if (err) {
        // console.error(`[Stream Error] Client -> Upstream: ${err.message}`);
        if (reqCtx.res && !reqCtx.res.headersSent) {
          reqCtx.res!.setHeader("Connection", "close");
          reqCtx.res!.statusCode = 502; // Bad Gateway
          reqCtx.res!.end("Bad Gateway");
          console.error(
            reqCtx.res!.statusCode,
            "Sent to client for ->",
            targetUrl.href,
            "err:", err
          );
        }
        ProxyUtils.cleanUp([upstream, reqCtx.req?.socket!]);
        reqCtx.state.set(STATE.is_error, true);
      }
    });
    reqCtx.next_phase = Phase.RESPONSE;
    await Pipeline.run(ctx);
  }
}
