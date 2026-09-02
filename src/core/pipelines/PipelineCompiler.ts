import type { Phase } from "../../phase/Phase.ts";
import type { RequestScope } from "../scope/types.js";
import type { BaseHandler } from "../handlers/base/base.handler.ts";
import { HANDLERS } from "../handlers/registry/registry";
import { PipelineAbortSignal } from "../signals/pipelineAbortSignal";
import { WSOutboundBridge } from "../transport/ws/WSOutboundBridge.js";

/**
 * Orchestrates the proxy request lifecycle by managing and executing handler pipelines.
 *
 * It maps registered handlers to specific lifecycle phases, executes them sequentially,
 * manages state transitions, and provides centralized error handling for the proxy.
 */
export default class Pipeline {
  protected constructor() {}
  private static pipelines: Record<Phase, BaseHandler[]> = {
    tcp: [],
    handshake: [],
    request: [],
    response: [],
  };
  static compile() {
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
  static async run(scope: RequestScope) {
    const { request, lifecycle } = scope;

    if (!lifecycle.nextPhase) {
      return;
    }
    if (lifecycle.isHijacked) {
      lifecycle.nextPhase = undefined;
      return;
    }

    if (request.webSocket && !request.webSocket.isUpgraded) {
      console.info(
        `[Pipeline] Routing WS upgrade to Outbound Bridge: ${request.target.url}`,
      );
      
      lifecycle.nextPhase = undefined;
      await WSOutboundBridge.execute(scope);
      return;
    }


    let executionJumps = 0;
    const MAX_JUMPS = 10;

    while (lifecycle.nextPhase) {
      if (++executionJumps > MAX_JUMPS) {
        const originalHost =
          scope.request.target.originalHost ?? "unknown-host";
        console.error(
          `[Fatal] Infinite phase loop detected for: ${originalHost}. Terminating transaction.`,
        );
        scope.lifecycle.nextPhase = undefined;
        scope.lifecycle.isHijacked = true;
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
            lifecycle.nextPhase = undefined;
            return;
          }

          const EXPECTED_ERROR_CODES = new Set([
            "ECONNRESET", // Connection reset by peer
            "ETIMEDOUT", // Operation timed out
            "ECONNREFUSED", // Connection refused
            "EPIPE", // Broken pipe (client disconnected early)
          ]);

          // Check against codes or known library-specific timeout strings
          const isExpectedDrop =
            EXPECTED_ERROR_CODES.has(error.code) ||
            error.code === "ERR_TLS_HANDSHAKE_TIMEOUT" ||
            error.message?.includes("TLS Handshake Timeout");

          if (!isExpectedDrop) {
            console.error(
              `[Handler Error] ${step.name} failed during ${currentPhase}:`,
              scope.request.target.originalHost,
              error,
            );
          }

          const res = scope.request.client.res;
          if (res) {
            if (!res.headersSent && !res.writableEnded) {
              res.statusCode = 502;
              res.end("Proxy Error: Plugin Failure");
            } else if (!res.destroyed) {
              res.destroy();
            }
          }

          lifecycle.nextPhase = undefined;
          return;
        }
      }
    }
  }
}
