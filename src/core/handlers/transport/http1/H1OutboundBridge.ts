// outbound bridge (upstream to server session manage)

import type { RequestScope } from "../../../context-manager/types";
import { payloadEvents } from "../../../event-manager/payload-events/payloadEvents";
import { ProxyUtils } from "../../../utils/ProxyUtils";
import type { ProxyConfig } from "../../../../lib/Proxy";
import { ResponseCacheProcessor } from "../../bridge/ResponseCacheProcessor";
import { parseBody } from "../../utils/utils";

export class H1OutboundBridge {
  public static execute(
    scope: RequestScope,
    config: ProxyConfig,
    resolve: (value: void | PromiseLike<void>) => void,
    reject: (value: void | PromiseLike<void>) => void,
  ) {
    const { requestContext, lifecycle } = scope;
    // handle cache validation
    const upstream = requestContext.upstreamReq;

    if (!upstream) {
      lifecycle.state.set("error", true);
      return resolve();
    }

    // flag to track current promise

    let isSettled = false;

    const safeResolve = () => {
      if (!isSettled) {
        isSettled = true;
        resolve();
      }
    };

    const safeReject = (err?: any) => {
      if (!isSettled) {
        isSettled = true;
        reject(err);
      }
    };

    const cacheProcessor = new ResponseCacheProcessor(scope, config);
    if (cacheProcessor.tryServeHit()) {
      return safeResolve();
    }

    upstream.on("response", async (upstreamRes) => {
      requestContext.responseHeaders = upstreamRes.headers;

      requestContext.upstreamRes = upstreamRes;

      requestContext.status = {
        statusCode: Number(upstreamRes.statusCode),
        statusText: upstreamRes.statusMessage || "",
      };

      if (cacheProcessor.tryServeRevalidation(upstreamRes)) {
        return safeResolve();
      }
      cacheProcessor.initializeUpstreamIntercept(upstreamRes);

      const responseChunks: Buffer[] = [];

      upstreamRes.on("data", (chunk) => {
        cacheProcessor.trackChunk(chunk);
        responseChunks.push(
          typeof chunk === "string" ? Buffer.from(chunk) : chunk,
        );
      });

      upstreamRes.on("end", () => {
        try {
          cacheProcessor.commit(upstreamRes);
          // parse body
          if (responseChunks.length > 0) {
            const rawBuffer = Buffer.concat(responseChunks);
            const contentEncoding =
              upstreamRes.headers["content-encoding"] || "";
            scope.requestContext.responseBody = parseBody(
              rawBuffer,
              contentEncoding,
            );
          }

          ProxyUtils.cleanUp([upstreamRes, upstream]);
          lifecycle.state.set("isFinished", true);
          lifecycle.nextPhase = undefined;
          safeResolve();
        } catch (error) {
          safeReject();
        }
      });
      // async safe

      upstreamRes.on("error", (err) => {
        if (!["ECONNRESET", "EPIPE"].includes((err as any).code)) {
          console.error("UpstreamRes error:", err);
        }

        lifecycle.state.set("error", true);
        if (!requestContext.res!.writableEnded) {
          requestContext.res!.destroy(err);
          safeReject();
        }
      });

      // expose RES to public api

      payloadEvents.emitAsync("PAYLOAD:RESPONSE", { scope });

      // await Promise.allSettled([
      //   payloadEvents.emitAsync("PAYLOAD:RESPONSE", { scope }),
      // ]);

      // if headers were already sent by plugins
      if (
        requestContext.res!.writableEnded ||
        requestContext.res!.headersSent ||
        requestContext.res!.destroyed
      ) {
        upstreamRes.destroy();
        safeResolve();
        return;
      }
      try {
        requestContext.res!.writeHead(
          upstreamRes.statusCode || 500,
          upstreamRes.headers,
        );
        upstreamRes.pipe(requestContext.res!);
      } catch (error) {
        console.error("[Pipe Error] Failed to write to client:", error);
        upstreamRes.destroy();
        safeReject();
      }
    });
  }
}
