import { Phase } from "../../phase/Phase.ts";
import type { ProxyContext } from "../../types/types.ts";
import { HANDLERS } from "../handlers/registry/registry.ts";
import { PipelineAbortSignal } from "../signals/pipelineAbortSignal.ts";
export default class Pipeline {
  protected constructor() {}
  private static pipelines: Record<Phase, { name: any; handle: any }[]> = {};
  static compile() {
    const handlers = HANDLERS;
    // console.info(handlers);
    Pipeline.pipelines = {
      // tcp: [...handlers]
      //   .filter((h) => h.phase === Phase.TCP)
      //   .map((h) => ({
      //     name: h.name,
      //     handle: h.handle,
      //   })),
      handshake: [...handlers]
        .filter((h) => h.phase === Phase.HANDSHAKE)
        .map((h) => ({
          name: h.name,
          handle: h.handle,
        })),

      request: [...handlers]
        .filter((h) => h.phase === Phase.REQUEST)
        .map((h) => ({
          name: h.name,
          handle: h.handle,
        })),
      response: [...handlers]
        .filter((h) => h.phase === Phase.RESPONSE)
        .map((h) => ({
          name: h.name,
          handle: h.handle,
        })),
    };
    // console.info(Pipeline.pipelines);
    // console.info(`[Worker ${process.pid}] Pipeline initialized successfully`);
  }

  /**
   * @redefined
   */
  static async run(ctx: ProxyContext) {
    if (!ctx.requestContext.nextPhase) {
      // console.info("Next phase is undefined. Halting pipeline");
      return;
    }
    if (ctx.isHandled) {
      console.info("handled for", ctx.clientToProxyHost);
      ctx.requestContext.nextPhase = undefined;
      return;
    }

    while (ctx.requestContext.nextPhase) {
      const currentPhase = ctx.requestContext.nextPhase;
      ctx.requestContext.nextPhase = undefined;

      const steps = Pipeline.pipelines[currentPhase];
      if (!steps || steps.length === 0) {
        console.warn(`No handlers found for phase: ${currentPhase}`);
        break;
      }

      for (const step of steps) {
        try {
          await step.handle(ctx);
        } catch (error) {
          if (error instanceof PipelineAbortSignal) {
            // console.debug(
            //   `[Pipeline] Halting ${currentPhase} phase early: Socket was taken over.`,
            // );
            ctx.requestContext.nextPhase = undefined;
            return;
          }

          console.error(
            `[Plugin Error] ${step.name} failed during ${currentPhase}:`,
            // (error as Error).message,
            ctx.clientToProxyHost,
          );

          const res = ctx.requestContext.res;

          if (res) {
            if (!res.headersSent && !res.writableEnded) {
              res.statusCode = 502;
              res.end("Proxy Error: Plugin Failure");
            } else if (!res.destroyed) {
              res.destroy();
            }
          }

          ctx.requestContext.nextPhase = undefined;
          return;
        }
      }
    }
  }
}
