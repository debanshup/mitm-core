import { Phase } from "../phase/Phase.ts";
import type { ProxyContext } from "../types/types.ts";
import { HANDLERS } from "../handlers/registry/registry.ts";
import { STATE } from "../state/state.ts";
import { ContextManager } from "../context-manager/ContextManager.ts";

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
    console.info(`[Worker ${process.pid}] Pipeline initialized successfully`);
  }

  /**
   * @redefined
   */
  static async run(ctx: ProxyContext) {
    // console.info("Fired run for", ctx.reqCtx.req?.url);
    if (!ctx.reqCtx.next_phase) {
      console.info("Next phase is undefined. Halting pipeline");
      return;
    }

    // console.info("Next Phase:",ctx.reqCtx.next_phase);

    while (ctx.reqCtx.next_phase) {
      const currentPhase = ctx.reqCtx.next_phase;
      // console.info("next phase", currentPhase);
      ctx.reqCtx.next_phase = undefined;

      const steps = Pipeline.pipelines[currentPhase];
      if (!steps || steps.length === 0) {
        console.warn(`No handlers found for phase: ${currentPhase}`);
        break;
      }
      for (const step of steps) {
        try {
          // console.info(step)
          await step.handle(ctx);
        } catch (error) {
          console.error(`[Plugin Error] ${step.name}:`, error);
          if (!ctx.reqCtx!.res?.headersSent) {
            ctx.reqCtx!.res!.statusCode = 502;
            ctx.reqCtx!.res!.end("Proxy Error: Plugin Failure");
          }
        }
      }
    }
  }
}
