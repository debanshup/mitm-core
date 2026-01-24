import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../types/types.ts";
import { BaseHandler } from "./base/base.handler.ts";
import { ResponseCache } from "../cache-manager/ResponseCache.ts";
import { STATE } from "../state/state.ts";
import { ProxyUtils } from "../utiils/ProxyUtils.ts";

export class ResponseHandler extends BaseHandler {
  /**
   * @override
   */
  static phase = Phase.RESPONSE;
  /**
   * @override
   */
  public static async handle(ctx: ProxyContext) {
    // console.info("r- handler");

    const reqCtx = ctx.reqCtx;
    
    const cache_key = ResponseCache.generateKey(reqCtx.req);
    // console.info(cache_key);
    const cached = ResponseCache.get(cache_key);
    // console.info(cached, "for", reqCtx.req.headers.host, reqCtx.req.url);
    if (cached) {
      const isExpired = Date.now() > cached.expires;
      if (!isExpired) {
        console.info(
          "Found in cache and not expired for ::",
          reqCtx.req!.headers.host,
        );
        reqCtx.res?.writeHead(cached.status, {
          ...cached.headers,
          // "x-mitm-cache": "HIT",
        });
        reqCtx.res?.end(cached.body);
        reqCtx.state.set(STATE.response_cache_hit, true);
        return;
      } else {
        // console.info("expired");
        ResponseCache.delete(cache_key);
      }
    }
    const upstream = reqCtx.upstream;
    upstream?.on("response", (upstreamRes) => {
      const chunks: Buffer[] = [];
      upstreamRes.on("data", (chunk) => {
        chunks.push(chunk); 
      });
      upstreamRes.on("close", (hadErr: boolean) => {
        ProxyUtils.cleanUp([upstreamRes, upstream!]);
        // console.info(
        //   "STATUS ::",
        //   reqCtx.res?.statusCode,
        //   "METHOD ::",
        //   reqCtx.res?.req.method,
        // );
        if (hadErr) {
          reqCtx.state.set(STATE.is_error, true);
          return;
        }
        reqCtx.state.set(STATE.is_finished, true);
      });
      upstreamRes.on("end", () => {
        if (
          ResponseCache.isCacheableResponse(
            reqCtx.req!,
            upstreamRes,
            chunks.length,
          )
        ) {
          ResponseCache.set(cache_key, {
            status: upstreamRes.statusCode!,
            headers: upstreamRes.headers,
            body: Buffer.concat(chunks),
            expires: ResponseCache.getExpirationTimestamp(upstreamRes.headers),
          });
        }
      });

      upstreamRes.on("error", (err) => {
        if (!["ECONNRESET", "EPIPE"].includes((err as any).code)) {
          console.error("UpstreamRes error:", err);
        }

        reqCtx.state.set(STATE.is_error, true);

        if (!reqCtx.res!.writableEnded) {
          reqCtx.res!.destroy(err);
        }
      });

      // if headers were already sent by plugins
      if (reqCtx.res!.writableEnded || reqCtx.res!.headersSent) {
        return;
      }
      reqCtx.res!.writeHead(upstreamRes.statusCode || 500, upstreamRes.headers);
      // Pipe Upstream Response -> Client and vice versa

      upstreamRes.pipe(reqCtx.res!);
    });

    /**
     * @ownership_issue
     */
    // pipeline(upstreamRes, reqCtx.res!, (err) => {
    //   if (err) {
    //     if (err && !["ECONNRESET", "EPIPE"].includes((err as any).code)) {
    //       console.error("Bridge Error:", err);
    //     }
    //     ProxyUtils.cleanUp([upstreamRes]);
    //     reqCtx.state.set(STATE.is_error, true);
    //   }
    // });
  }
}
