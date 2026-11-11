import type { Phase } from "../../phase/Phase.ts";
import type { FailureScope, RequestScope } from "../scope/types.js";
import type { BaseHandler } from "../handlers/base/base.handler.ts";
import { HANDLERS } from "../handlers/registry/registry";
import { PipelineAbortSignal } from "../signals/pipelineAbortSignal";
import { WSOutboundBridge } from "../transport/ws/WSOutboundBridge.js";
import { reportProxyError } from "../event/proxy-events/proxyEvents.js";

/**
 * Orchestrates the proxy request lifecycle by managing and executing handler pipelines.
 *
 * It maps registered handlers to specific lifecycle phases, executes them sequentially,
 * manages state transitions, and provides centralized error handling for the proxy.
 */
export default class Pipeline {
  private static pipelines: Record<Phase, BaseHandler[]> = {
    tcp: [],
    handshake: [],
    request: [],
    response: [],
  };

  private static handlePipelineFailure(
    scope: RequestScope,
    error: unknown,
    phase: Phase,
    handlerName: string,
  ): void {
    const details =
      error !== null && typeof error === "object"
        ? (error as { code?: unknown; message?: unknown })
        : undefined;

    const message =
      error instanceof Error
        ? error.message
        : typeof details?.message === "string"
          ? details.message
          : String(error);

    const code = typeof details?.code === "string" ? details.code : undefined;

    const normalizedError =
      error instanceof Error
        ? error
        : Object.assign(new Error(message), code ? { code } : {});

    const res = scope.request.client.res;

    const failureScope: FailureScope =
      phase === "tcp" || phase === "handshake" || (!!res && res.headersSent)
        ? "connection"
        : "request";

    scope.lifecycle.failure = {
      message,
      phase,
      failedAt: Date.now(),
      disposition: "terminal",
      scope: failureScope,
      ...(code ? { code } : {}),
      cause: error,
    };

    reportProxyError(normalizedError);

    const expectedCodes = new Set([
      "ECONNRESET",
      "ETIMEDOUT",
      "ECONNREFUSED",
      "EPIPE",
    ]);

    const isExpectedDrop =
      expectedCodes.has(code ?? "") ||
      code === "ERR_TLS_HANDSHAKE_TIMEOUT" ||
      message.includes("TLS Handshake Timeout");

    if (!isExpectedDrop) {
      console.error(
        `[Handler Error] ${handlerName} failed during ${phase}:`,
        scope.request.target.originalHost,
        message,
      );
    }

    const wsSocket = scope.request.webSocket?.rawUpgradeSocket;

    if (wsSocket && !scope.request.webSocket?.isUpgraded) {
      if (!wsSocket.destroyed && wsSocket.writable) {
        wsSocket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
      } else if (!wsSocket.destroyed) {
        wsSocket.destroy();
      }
    } else if (failureScope === "connection") {
      if (res && !res.destroyed) {
        res.destroy();
      } else if (!scope.session.socket.destroyed) {
        scope.session.socket.destroy();
      }
    } else if (res && !res.headersSent && !res.writableEnded) {
      res.statusCode = 502;
      res.end("Proxy Error: Plugin Failure");
    }

    scope.lifecycle.nextPhase = undefined;
  }

  private static handlePipelineAbort(
    scope: RequestScope,
    signal: PipelineAbortSignal,
    phase: Phase,
  ): void {
    const { lifecycle } = scope;

    lifecycle.abort = {
      ...(signal.data ?? {}),
      message: signal.message,
      phase,
      abortedAt: Date.now(),
    };

    lifecycle.nextPhase = undefined;

    console.info(
      "[Pipeline] Execution intentionally aborted:",
      lifecycle.abort,
    );
  }

  public static compile() {
    this.pipelines = { tcp: [], handshake: [], request: [], response: [] };
    for (const HandlerClass of HANDLERS) {
      const instance = new HandlerClass();
      const phase = instance.phase;
      if (this.pipelines[phase]) {
        this.pipelines[phase].push(instance);
      } else {
        console.warn(`[Pipeline] Ignored handler with unknown phase: ${phase}`);
      }
    }

    console.info(`Pipeline initialized successfully`);
  }

  /**
   * Executes handlers for the current phase in the provided proxy context.
   * Handles phase sequencing, pipeline abortion, and error recovery (502 response).
   */
  public static async run(scope: RequestScope) {
    const { request, lifecycle } = scope;

    if (!lifecycle.nextPhase) {
      return;
    }

    if (
      lifecycle.abort ||
      (lifecycle.failure && lifecycle.failure.disposition === "terminal") ||
      lifecycle.isHijacked
    ) {
      lifecycle.nextPhase = undefined;
      return;
    }

    if (request.webSocket && !request.webSocket.isUpgraded) {
      lifecycle.nextPhase = undefined;

      try {
        await WSOutboundBridge.execute(scope);
      } catch (error) {
        if (error instanceof PipelineAbortSignal) {
          this.handlePipelineAbort(scope, error, "request");
        } else {
          this.handlePipelineFailure(
            scope,
            error,
            "request",
            "WSOutboundBridge",
          );
        }
      }

      return;
    }
    let executionJumps = 0;
    const MAX_JUMPS = 10;

    while (lifecycle.nextPhase) {
      if (
        lifecycle.abort ||
        (lifecycle.failure && lifecycle.failure.disposition === "terminal") ||
        lifecycle.isHijacked
      ) {
        lifecycle.nextPhase = undefined;
        return;
      }

      if (++executionJumps > MAX_JUMPS) {
        const originalHost =
          scope.request.target.originalHost ?? "unknown-host";
        console.error(
          `[Fatal] Infinite phase loop detected for: ${originalHost}. Terminating transaction.`,
        );
        const failedPhase = lifecycle.nextPhase;

        lifecycle.failure = {
          message: "Infinite pipeline phase loop detected",
          phase: failedPhase,
          scope: "connection",
          disposition: "terminal",
          failedAt: Date.now(),
        };

        lifecycle.nextPhase = undefined;
        const res = scope.request.client.res;
        if (res) {
          try {
            if (!res.headersSent) {
              res.writeHead(508, {
                "Content-Type": "application/json",
                Connection: "close",
              });

              res.end(
                JSON.stringify({
                  error: "Loop Detected",
                  message: `The proxy engine encountered an infinite routing loop processing: ${originalHost}`,
                  requestId: scope.request.requestId,
                }),
              );
            } else {
              console.warn(
                `[Warning] Loop detected but headers already sent for request ${scope.request.requestId}. Forcing socket termination.`,
              );
              res.destroy();
            }
          } catch (responseError) {
            console.error(
              `[Error] Failed to cleanly write 508 response:`,
              responseError,
            );
            scope.session.socket.destroy();
          }
        } else {
          scope.session.socket.destroy();
        }
        break;
      }
      const currentPhase = lifecycle.nextPhase;
      lifecycle.nextPhase = undefined;

      const steps = Pipeline.pipelines[currentPhase];
      if (!steps || steps.length === 0) {
        console.warn(`[Pipeline] No handlers found for phase: ${currentPhase}`);
        break;
      }

      for (const step of steps) {
        try {
          await step.handle(scope);
        } catch (error: any) {
          if (error instanceof PipelineAbortSignal) {
            this.handlePipelineAbort(scope, error, currentPhase);
            return;
          }
          this.handlePipelineFailure(scope, error, currentPhase, step.name);

          return;
        }

        if (
          lifecycle.isHijacked ||
          (lifecycle.failure && lifecycle.failure.disposition === "terminal")
        ) {
          lifecycle.nextPhase = undefined;
          return;
        }
      }
    }
  }

  public static setPipelineForTest(
    phase: Phase,
    handlers: BaseHandler[],
  ): void {
    this.pipelines[phase] = handlers;
  }
}
