// outbound bridge (upstream to server session manage)

import type { RequestScope } from "../../context-manager/types";
import { payloadEvents } from "../../event-manager/payload-events/payloadEvents";
import { ProxyUtils } from "../../utils/ProxyUtils";
import type { ProxyConfig } from "../../../lib/Proxy";
import { ResponseCacheProcessor } from "../../handlers/bridge/ResponseCacheProcessor";
import { parseBody } from "../../handlers/utils/utils";
import { ScopeMutator } from "../../context-manager/ScopeMutator";
import { connectionEvents } from "../../event-manager/connection-events/connectionEvents";
import { proxyEventManager } from "../../event-manager/proxy-events/proxyEvents";
import { pluginEventManager } from "../../event-manager/plugin-events/pluginEvents";

export class H1OutboundBridge {
  public static execute(
    scope: RequestScope,
    config: ProxyConfig,
    resolve: (value: void | PromiseLike<void>) => void,
    reject: (value: void | PromiseLike<void>) => void,
  ) {
    const { requestContext, lifecycle } = scope;
    const upstream = requestContext.upstreamReq;

    if (!upstream) {
      lifecycle.state.set("error", true);
      return resolve();
    }

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

    if (requestContext.req && requestContext.req.socket) {
      requestContext.req.socket.once("close", async () => {
        if (!isSettled) {
          await pluginEventManager.emitAsync("proxy:client-disconnect", {
            scope,
          });
          safeReject(new Error("CLIENT_DISCONNECTED"));
        }
      });
    }

    const cacheProcessor = new ResponseCacheProcessor(scope, config);
    if (cacheProcessor.tryServeHit()) {
      return safeResolve();
    }

    upstream.on("response", async (upstreamRes) => {
      await connectionEvents.emitAsync("UPSTREAM:RESPONSE", {
        scope,
        upstreamRes,
      });

      if (cacheProcessor.tryServeRevalidation(upstreamRes)) {
        return safeResolve();
      }
      cacheProcessor.initializeUpstreamIntercept(upstreamRes);

      const contentType = upstreamRes.headers["content-type"] || "";
      const shouldBuffer =
        contentType.includes("text/") ||
        contentType.includes("application/json");

      if (!shouldBuffer) {
        try {
          await proxyEventManager.emitAsync("response", { scope });
        } catch (error) {
          console.error("[Event Error] PAYLOAD:RESPONSE failed:", error);
        }

        if (
          lifecycle.isHijacked ||
          requestContext.res!.writableEnded ||
          requestContext.res!.destroyed
        ) {
          upstreamRes.destroy();
          return safeResolve();
        }

        try {
          requestContext.res!.writeHead(
            upstreamRes.statusCode || 500,
            upstreamRes.headers,
          );

          upstreamRes.pipe(requestContext.res!);

          upstreamRes.on("end", () => {
            ScopeMutator.finishPipeline(scope);
            safeResolve();
          });

          upstreamRes.on("error", async (err) => {
            if (!["ECONNRESET", "EPIPE"].includes((err as any).code)) {
              console.error("UpstreamRes stream error:", err);
            }
            await pluginEventManager.emitAsync("proxy:target-error", { scope });
            ScopeMutator.failPipeline(scope, err);

            if (
              !requestContext.res!.writableEnded &&
              !requestContext.res!.destroyed
            ) {
              requestContext.res!.destroy(err);
            }
            safeReject(err);
          });
        } catch (error) {
          upstreamRes.destroy();
          safeReject(error);
        }
        return;
      }

      const responseChunks: Buffer[] = [];

      upstreamRes.on("data", (chunk) => {
        cacheProcessor.trackChunk(chunk);
        responseChunks.push(
          typeof chunk === "string" ? Buffer.from(chunk) : chunk,
        );
      });

      upstreamRes.on("end", async () => {
        try {
          cacheProcessor.commit(upstreamRes);

          if (responseChunks.length > 0) {
            const rawBuffer = Buffer.concat(responseChunks);
            const contentEncoding =
              upstreamRes.headers["content-encoding"] || "";
            const parsedBody = parseBody(rawBuffer, contentEncoding);
            ScopeMutator.applyResponseBody(scope, parsedBody);
          }

          ProxyUtils.cleanUp([upstreamRes, upstream]);
          ScopeMutator.finishPipeline(scope);

          try {
            await proxyEventManager.emitAsync("response", { scope });
          } catch (error) {
            console.error(
              "[Event Error] Buffered PAYLOAD:RESPONSE failed:",
              error,
            );
          }

          if (
            requestContext.res!.writableEnded ||
            requestContext.res!.headersSent ||
            requestContext.res!.destroyed
          ) {
            return safeResolve();
          }

          requestContext.res!.writeHead(
            upstreamRes.statusCode || 500,
            upstreamRes.headers,
          );

          if (responseChunks.length > 0) {
            const finalBuffer = Buffer.concat(responseChunks);
            requestContext.res!.write(finalBuffer, () => {
              requestContext.res!.end();
              safeResolve();
            });
          } else {
            requestContext.res!.end();
            safeResolve();
          }
        } catch (error) {
          console.error("[Buffered Path End Error]:", error);
          safeReject(error);
        }
      });

      upstreamRes.on("error", async (err) => {
        if (!["ECONNRESET", "EPIPE"].includes((err as any).code)) {
          console.error("UpstreamRes buffer error:", err);
        }
        await pluginEventManager.emitAsync("proxy:target-error", { scope });
        ScopeMutator.failPipeline(scope, err);
        upstreamRes.destroy(); // Prevent memory leaks on open sockets

        if (
          !requestContext.res!.writableEnded &&
          !requestContext.res!.destroyed
        ) {
          requestContext.res!.destroy(err);
        }
        safeReject(err);
      });
    });

    upstream.on("error", async (err) => {
      if (!isSettled) {
        ScopeMutator.failPipeline(scope, err);
        await pluginEventManager.emitAsync("proxy:target-error", { scope });
        safeReject(err);
      }
    });
  }
}
