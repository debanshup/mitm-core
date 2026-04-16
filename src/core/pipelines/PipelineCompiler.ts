import type { Phase } from "../../phase/Phase.ts";
import type { ProxyContext } from "../context-manager/ContextManager.ts";
import type { BaseHandler } from "../handlers/base/base.handler.ts";
import { HANDLERS } from "../handlers/registry/registry.ts";
import { PipelineAbortSignal } from "../signals/pipelineAbortSignal.ts";
export default class Pipeline {
  protected constructor() {}
  private static pipelines: Record<Phase, BaseHandler[]> = {
    tcp: [],
    handshake: [],
    request: [],
    response: [],
  };
  static compile() {
    // 2. Reset the pipelines (useful if you ever implement hot-reloading)
    this.pipelines = { tcp: [], handshake: [], request: [], response: [] };

    // 3. Iterate over the strictly typed Set<HandlerConstructor>
    for (const HandlerClass of HANDLERS) {
      // Instantiate cleanly (TypeScript knows this returns a BaseHandler)
      const instance = new HandlerClass();

      // Access the instance property instead of the static property
      const phase = instance.phase;

      // Dynamically push to the correct bucket based on the string literal
      if (this.pipelines[phase]) {
        this.pipelines[phase].push(instance);
      } else {
        console.warn(`[Pipeline] Ignored handler with unknown phase: ${phase}`);
      }
    }

    console.info(`[Worker ${process.pid}] Pipeline initialized successfully`);
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
