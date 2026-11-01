import type { RequestScope } from "../../scope/types";
import { ResponseCacheProcessor } from "../../cache/ResponseCacheProcessor";
import { ScopeMutator } from "../../scope/ScopeMutator";
import { connectionEvents } from "../../event/connection-events/connectionEvents";
import { pluginEventManager } from "../../event/plugin-events/pluginEvents";
import { ResponseDispatcher } from "./responseDispatcher";
import type { ProxyConfig } from "../../../config.registry";
import { reportProxyError } from "../../event/proxy-events/proxyEvents";
import { PipelineAbortSignal } from "../../signals/pipelineAbortSignal";

export class H1OutboundBridge {
  public static execute(
    scope: RequestScope,
    config: ProxyConfig,
    resolve: (value: void | PromiseLike<void>) => void,
    reject: (value: void | PromiseLike<void> | Error) => void,
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
      if (isSettled) return;
      try {
        scope.lifecycle.timestamps.upstreamReceivedAt = Date.now();

        await connectionEvents.emitAsync("UPSTREAM:RESPONSE", {
          scope,
          upstreamRes,
        });

        // An upstream error may have settled the bridge
        // while the event listeners were executing.
        if (isSettled) return;

        if (scope.lifecycle.isHijacked) {
          safeResolve();
          return;
        }

        if (cacheProcessor.tryServeRevalidation(upstreamRes)) {
          safeResolve();
          return;
        }

        cacheProcessor.initializeUpstreamIntercept(upstreamRes);

        await ResponseDispatcher.handle(
          scope,
          upstreamRes,
          cacheProcessor,
          upstreamReq,
        );

        safeResolve();
      } catch (error) {
        if (error instanceof PipelineAbortSignal) {
          safeReject(error);
          return;
        }
        reportProxyError(error);

        if (!upstreamRes.destroyed) {
          upstreamRes.destroy();
        }

        if (!inboundRes.destroyed && !inboundRes.writableEnded) {
          if (!inboundRes.headersSent) {
            inboundRes.writeHead(502, { Connection: "close" });
            inboundRes.end("Bad Gateway: Proxy response handling failed.");
          } else {
            inboundRes.destroy();
          }
        }

        safeReject(error);
      }
    });

    upstreamReq.on("error", async (err) => {
      if (isSettled) return;
      isSettled = true;

      const errorCode =
        err &&
        typeof err === "object" &&
        typeof (err as NodeJS.ErrnoException).code === "string"
          ? (err as NodeJS.ErrnoException).code
          : undefined;

      const errorMessage = err instanceof Error ? err.message : String(err);

      const isClientDisconnected =
        errorCode === "ERR_CLIENT_DISCONNECTED" ||
        errorMessage === "ERR_CLIENT_DISCONNECTED";

      const isExpectedDrop =
        errorCode === "ECONNRESET" ||
        errorCode === "ERR_STREAM_PREMATURE_CLOSE";

      if (!isExpectedDrop && !isClientDisconnected) {
        scope.lifecycle.failure = {
          message: errorMessage,
          phase: "request",
          failedAt: Date.now(),
          disposition: "terminal",
          scope: "request",
          ...(errorCode ? { code: errorCode } : {}),
          cause: err,
        };

        reportProxyError(err);
      }

      try {
        ScopeMutator.failPipeline(scope);

        if (!upstreamReq.destroyed) {
          upstreamReq.destroy();
        }

        if (typeof inboundReq.destroy === "function" && !inboundReq.destroyed) {
          inboundReq.destroy();
        }

        if (!inboundRes.destroyed) {
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
        if (pluginErr instanceof PipelineAbortSignal) {
          scope.lifecycle.abort = {
            ...(pluginErr.data ?? {}),
            message: pluginErr.message,
            phase: "request",
            abortedAt: Date.now(),
          };

          reject(pluginErr);
          return;
        }
      }

      reject(err as any);
    });

    upstreamReq.on("timeout", () => {
      console.warn(
        `[Proxy Timeout]: Upstream server ${request.target.host} timed out.`,
      );

      if (!upstreamReq.destroyed) {
        const timeoutErr = Object.assign(
          new Error("Upstream request timed out"),
          { code: "ERR_UPSTREAM_TIMEOUT" },
        );

        upstreamReq.destroy(timeoutErr);
      }
    });
  }
}
