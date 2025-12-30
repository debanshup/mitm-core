import { Phase } from "../phase/Phase.ts";
import type { ProxyContext } from "../types/types.ts";
import { HANDLERS } from "../handlers/registry/registry.ts";

export class Pipeline {
  private static pipelines: Record<Phase, any[]> = {};
  static compile() {
    const handlers = HANDLERS;
    this.pipelines = {
      tcp: [...handlers]
        .filter((h) => h.phase === Phase.TCP)
        .map((h) => ({
          name: h.name,
          execute: h.execute,
        })),
      connect: [...handlers]
        .filter((h) => h.phase === Phase.CONNECT)
        .map((h) => ({
          name: h.name,
          execute: h.execute,
        })),

      request: [...handlers]
        .filter((h) => h.phase === Phase.REQUEST)
        .map((h) => ({
          name: h.name,
          execute: h.execute,
        })),
      response: [...handlers]
        .filter((h) => h.phase === Phase.RESPONSE)
        .map((h) => ({
          name: h.name,
          execute: h.execute,
        })),
    };
    console.info("Pipeline initialized");
  }

  static async run(phase: Phase, ctx: ProxyContext) {
    for (const step of this.pipelines[phase]!) {
      try {
        await step.execute(ctx);
        // short circuit
        if (ctx.state.get("STOP")) {
          break;
        }
      } catch (err) {
        console.error(`[Plugin Error] ${step.name}:`, err);
        if (!ctx.res?.headersSent) {
          ctx.res!.statusCode = 502;
          ctx.res!.end("Proxy Error: Plugin Failure");
        }
      }
    }
  }
}
