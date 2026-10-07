import type { RequestScope } from "../../scope/types";
import type { ProxyConfig } from "../../../lib/Proxy";

import { ResponseCacheProcessor } from "../../cache/ResponseCacheProcessor";
import { ScopeMutator } from "../../scope/ScopeMutator";
import { connectionEvents } from "../../event/connection-events/connectionEvents";
import { pluginEventManager } from "../../event/plugin-events/pluginEvents";
import { ResponseDispatcher } from "./responseDispatcher";

export class H1OutboundBridge {
  public static execute(
    scope: RequestScope,
    config: ProxyConfig,
    resolve: (value: void | PromiseLike<void>) => void,
    reject: (value: void | PromiseLike<void>) => void,
  ) {
    const { request, lifecycle } = scope;
    const upstreamReq = request.upstream.req;
    const inboundReq = request.client.req;
    const inboundRes = request.client.res;

    if (!upstreamReq || !inboundReq || !inboundRes) {
      lifecycle.state.set("error", true);
      return resolve();
    }

    inboundRes.once("finish", () => {
      lifecycle.timestamps.respondedAt = Date.now();

      lifecycle.timestamps.duration =
        lifecycle.timestamps.respondedAt - lifecycle.timestamps.receivedAt;
    });

    let isSettled = false;

    const safeResolve = () => {
      if (isSettled) return;
      isSettled = true;
      resolve();
    };

    const safeReject = (err?: any) => {
      if (isSettled) return;
      isSettled = true;
      reject(err);
    };

    const cacheProcessor = new ResponseCacheProcessor(scope, config);

    if (cacheProcessor.tryServeHit()) {
      return safeResolve();
    }

    upstreamReq.on("response", async (upstreamRes) => {
      scope.lifecycle.timestamps.upstreamReceivedAt = Date.now();
      await connectionEvents.emitAsync("UPSTREAM:RESPONSE", {
        scope,
        upstreamRes,
      });

      if (cacheProcessor.tryServeRevalidation(upstreamRes)) {
        return safeResolve();
      }

      cacheProcessor.initializeUpstreamIntercept(upstreamRes);

      try {
        await ResponseDispatcher.handle(
          scope,
          upstreamRes,
          cacheProcessor,
          upstreamReq,
        );
        safeResolve();
      } catch (error) {
        safeReject(error);
      }
    });

    upstreamReq.on("error", async (err) => {
      const errorCode = (err as NodeJS.ErrnoException).code;

      const isClientDisconnected =
        errorCode === "ERR_CLIENT_DISCONNECTED" ||
        err.message === "ERR_CLIENT_DISCONNECTED";

      const isExpectedDrop =
        errorCode === "ECONNRESET" ||
        errorCode === "ERR_STREAM_PREMATURE_CLOSE";

      if (!isExpectedDrop && !isClientDisconnected) {
        console.error("[H1OutboundBridge] Upstream Error:", errorCode);
        console.info(err);
      }

      if (isSettled) return;
      isSettled = true;

      try {
        ScopeMutator.failPipeline(scope);

        if (!upstreamReq.destroyed) {
          upstreamReq.destroy();
        }

        if (typeof inboundReq.destroy === "function" && !inboundReq.destroyed) {
          inboundReq.destroy();
        }

        if (inboundRes.destroyed) {
          return;
        }

        if (!inboundRes.headersSent && !inboundRes.writableEnded) {
          if (errorCode === "ERR_UPSTREAM_TIMEOUT") {
            const body = JSON.stringify({
              error: "Gateway Timeout: Upstream failed to respond.",
            });

            inboundRes.writeHead(504, {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
              Connection: "close",
            });

            inboundRes.end(body);
          } else if (isClientDisconnected) {
            inboundRes.destroy();
          } else {
            const body = "Bad Gateway: Remote target connection dropped.";

            inboundRes.writeHead(502, {
              "Content-Type": "text/plain",
              "Content-Length": Buffer.byteLength(body),
              Connection: "close",
            });

            inboundRes.end(body);
          }
        } else {
          inboundRes.destroy(err);
        }
      } catch (criticalCleanupErr) {
        console.error(
          "[Proxy Core] Critical sync error cleanup failed:",
          criticalCleanupErr,
        );
      }

      try {
        await pluginEventManager.emitAsync("proxy:target-error", {
          scope,
        });
      } catch (pluginErr) {
        console.error(
          "[Proxy Core] Plugin error notification failed:",
          pluginErr,
        );
      }

      reject(err as any);
    });

    upstreamReq.on("timeout", () => {
      console.warn(
        `[Proxy Timeout]: Upstream server ${request.target.host} timed out.`,
      );
      if (!upstreamReq.destroyed) {
        upstreamReq.destroy(new Error("ERR_UPSTREAM_TIMEOUT"));
      }
    });
  }
}
