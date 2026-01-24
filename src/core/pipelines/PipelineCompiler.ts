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
    console.info("Pipeline initialized");
  }

  /**
   * @redefine
   */
  static async run(ctx: ProxyContext) {
    if (!ctx.reqCtx.next_phase) {
      console.info("Next phase is undefined");
    }

    // console.info("Next Phase:",ctx.reqCtx.next_phase);

    for (const step of Pipeline.pipelines[ctx.reqCtx.next_phase!]!) {
      try {
        await step.handle(ctx);
      } catch (err) {
        console.error(`[Plugin Error] ${step.name}:`, err);
        if (!ctx.reqCtx!.res?.headersSent) {
          ctx.reqCtx!.res!.statusCode = 502;
          ctx.reqCtx!.res!.end("Proxy Error: Plugin Failure");
        }
      }
    }
  }


}
