import type { Phase } from "../../phase/Phase.ts";
import type {
  RequestScope,
} from "../context-manager/types.js";
import type { BaseHandler } from "../handlers/base/base.handler.ts";
import { HANDLERS } from "../handlers/registry/registry";
import { PipelineAbortSignal } from "../signals/pipelineAbortSignal";

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
    const { sessionContext, requestContext, lifecycle } = scope;

    if (!lifecycle.nextPhase) {
      // console.info("Next phase is undefined. Halting pipeline");
      return;
    }
    if (lifecycle.isHijacked) {
      // console.info("handled for", sessionContext.clientToProxyHost);
      lifecycle.nextPhase = undefined;
      return;
    }

    while (lifecycle.nextPhase) {
      const currentPhase = lifecycle.nextPhase;
      lifecycle.nextPhase = undefined;

      const steps = Pipeline.pipelines[currentPhase];
      if (!steps || steps.length === 0) {
        console.warn(`No handlers found for phase: ${currentPhase}`);
        break;
      }

      for (const step of steps) {
        try {
          // console.info("scope socket", scope.sessionContext.socket)
          await step.handle(scope);
        } catch (error: any) {
          console.info({message: error.message, url: scope.requestContext.clientToProxyUrl})
          if (error instanceof PipelineAbortSignal) {
            lifecycle.nextPhase = undefined;
            return;
          }

          // console.error(error)

          console.error(
            `[Handler Error] ${step.name} failed during ${currentPhase}:`,
            // (error as Error).message,
            requestContext.clientToProxyHost,
          );

          const res = requestContext.res;

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
