import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../types/types.ts";
import { BaseHandler } from "./base/base.handler.ts";
import { ResponseCache } from "../cache-manager/ResponseCache.ts";
import { STATE } from "../state/state.ts";
import { ProxyUtils } from "../utiils/ProxyUtils.ts";
import { Transform } from "stream";
import { dataEvents } from "../event-manager/data-events/dataEvents.ts";

export class ResponseHandler extends BaseHandler {
  /**
   * @override
   */
  static phase = Phase.RESPONSE;

  /**
   * @use it while modiying response data
   */

  private static modifier = new Transform({
    transform(chunk, encoding, callback) {
      let data = chunk.toString();
      const modifiedData = data;
      callback(null, modifiedData);
    },
  });

  private static sanitizeCachedHeaders(headers: Record<string, any>) {
    const ALLOW = new Set([
      "content-type",
      // "content-length", // REMOVED: Let Node.js calculate this
      "content-encoding", // ADDED: Crucial if cache is compressed (gzip/br)
      "etag",
      "last-modified",
      "cache-control",
      "expires",
      "vary",
      // ADDED: CORS headers (Essential for fetch/XHR)
      "access-control-allow-origin",
      "access-control-allow-methods",
      "access-control-allow-headers",
      "access-control-expose-headers",
    ]);

    const clean: Record<string, any> = {};

    for (const key of Object.keys(headers)) {
      const lowerKey = key.toLowerCase();

      if (ALLOW.has(lowerKey)) {
        const val = headers[key];
        if (Array.isArray(val)) {
          clean[lowerKey] = val.join(", ");
        } else if (val) {
          clean[lowerKey] = val;
        }
      }
    }

    return clean;
  }
  /**
   * @override
   */
  public static async handle(ctx: ProxyContext) {
    // console.info("r- handler");

    return new Promise<void>((resolve) => {
      const reqCtx = ctx.reqCtx;

      const cache_key = ResponseCache.generateKey(reqCtx.req);
      // console.info(cache_key);
      const cached = ResponseCache.get(cache_key)!;
      // console.info(cached, "for", reqCtx.req.headers.host, reqCtx.req.url);

      if (cached && Date.now() <= cached.expires) {
        console.info(`[Cache Hit] ${reqCtx.req!.headers.host}`);
        if (!reqCtx.res || reqCtx.res.headersSent || reqCtx.res.writableEnded) {
          return resolve();
        }
        const headers = ResponseHandler.sanitizeCachedHeaders(cached.headers);
        reqCtx.res?.writeHead(cached.status, headers);
        reqCtx.res?.end(cached.body);
        reqCtx.state.set(STATE.response_cache_hit, true);
        reqCtx.state.set(STATE.is_finished, true);
        reqCtx.next_phase = undefined;
        return resolve();
      } else if (cached) {
        ResponseCache.delete(cache_key);
      }

      const upstream = reqCtx.upstream;
      if (!upstream) {
        reqCtx.state.set(STATE.is_error, true);
        return resolve();
      }
      upstream?.on("response", (upstreamRes) => {
        ctx.reqCtx.upstreamRes = upstreamRes
        if (upstreamRes.statusCode === 304 && cached) {
          console.info(`[Cache Revalidated 304] ${reqCtx.req?.headers.host}`);

          cached.expires = ResponseCache.getExpirationTimestamp(
            upstreamRes.headers,
            30000,
            reqCtx.req?.headers.host!,
          );

          const headers = ResponseHandler.sanitizeCachedHeaders({
            ...cached.headers,
            "cache-control": upstreamRes.headers["cache-control"],
            expires: upstreamRes.headers["expires"],
          });

          if (!reqCtx.res!.headersSent && !reqCtx.res!.writableEnded) {
            reqCtx.res!.writeHead(200, headers);
            reqCtx.res!.end(cached.body);
          }

          // Destroy upstream res because we are serving from cache
          upstreamRes.destroy();
          reqCtx.state.set(STATE.is_finished, true);
          return resolve();
        }
        const isCacheable = ResponseCache.isCacheableResponse(
          reqCtx.req!,
          upstreamRes,
          0,
        );
        const chunks: Buffer[] = [];
        upstreamRes.on("data", (chunk) => {
          // check if cacheable
          if (isCacheable) {
            chunks.push(chunk);
          }
        });
        // upstreamRes.on("close", (hadErr: boolean) => {

        // });
        upstreamRes.on("end", () => {
          if (isCacheable) {
            ResponseCache.set(cache_key, {
              status: upstreamRes.statusCode!,
              headers: upstreamRes.headers,
              etag: upstreamRes.headers.etag || "",
              body: Buffer.concat(chunks),
              expires: ResponseCache.getExpirationTimestamp(
                upstreamRes.headers,
                30000,
                reqCtx.req?.headers.host!,
              ),
            });
          }
          ProxyUtils.cleanUp([upstreamRes, upstream!]);
          reqCtx.state.set(STATE.is_finished, true);
          reqCtx.next_phase = undefined;
          resolve();
        });

        upstreamRes.on("error", (err) => {
          if (!["ECONNRESET", "EPIPE"].includes((err as any).code)) {
            console.error("UpstreamRes error:", err);
          }

          reqCtx.state.set(STATE.is_error, true);

          if (!reqCtx.res!.writableEnded) {
            reqCtx.res!.destroy(err);
            return resolve();
          }
        });

        // expose RES to public api
        dataEvents.emit("DATA:RESPONSE", { ctx });

        // if headers were already sent by plugins
        if (
          reqCtx.res!.writableEnded ||
          reqCtx.res!.headersSent ||
          reqCtx.res!.destroyed
        ) {
          upstreamRes.destroy();
          return resolve();
        }
        reqCtx.res!.writeHead(
          upstreamRes.statusCode || 500,
          upstreamRes.headers,
        );
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
    });
  }
}
