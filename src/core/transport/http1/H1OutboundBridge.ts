import type { RequestScope } from "../../scope/types";
import type { ProxyConfig } from "../../../lib/Proxy";

import { ResponseCacheProcessor } from "../../handlers/utils/ResponseCacheProcessor";
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
      if (isSettled) return;
      isSettled = true;
      try {
        ScopeMutator.failPipeline(scope, err);

        if (!upstreamReq.destroyed) upstreamReq.destroy();

        if (typeof inboundReq.destroy === "function" && !inboundReq.destroyed) {
          inboundReq.destroy();
        }

        if (!inboundRes.destroyed) {
          if (!inboundRes.headersSent && !inboundRes.writableEnded) {
            if (err.message === "ERR_UPSTREAM_TIMEOUT") {
              inboundRes.writeHead(504, { "Content-Type": "application/json" });
              inboundRes.end(
                JSON.stringify({
                  error: "Gateway Timeout: Upstream failed to respond.",
                }),
              );
            } else if (err.message === "ERR_CLIENT_DISCONNECTED") {
              inboundRes.destroy();
            } else {
              inboundRes.writeHead(502, { "Content-Type": "text/plain" });
              inboundRes.end("Bad Gateway: Remote target connection dropped.");
            }
          } else {
            inboundRes.destroy(err);
          }
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
          // error: err,
        });
      } catch (pluginErr) {
        console.error(
          "[Proxy Core] Plugin error notification failed:",
          pluginErr,
        );
      }

      reject(err as any); // Bypass safeReject to avoid double-call since isSettled is true
    });
    upstreamReq.on("timeout", () => {
      console.warn(
        `[Proxy Timeout]: Upstream server ${request.target.host} timed out.`,
      );
      if (!upstreamReq.destroyed) {
        upstreamReq.destroy(new Error("ERR_UPSTREAM_TIMEOUT")); // add a config for upstream timeout
      }
    });
  }
}
