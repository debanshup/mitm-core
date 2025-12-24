import { unlink } from "fs";
import type { Plugin } from "../../plugins/PluginRegistry.ts";
import { Phase } from "../phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";

export class Pipeline {
  private static pipelines: Record<Phase, any[]> = {};
  static compile(plugins: Set<Plugin>) {
    this.pipelines = {
      tcp: [...plugins]
        .filter((p) => p.phase === Phase.TCP)
        .sort((a, b) => a.order! - b.order!)
        .map((p) => ({
          name: p.name,
          execute: p.execute,
        })),
      connect: [...plugins]
        .filter((p) => p.phase === Phase.CONNECT)
        .sort((a, b) => a.order! - b.order!)
        .map((p) => ({
          name: p.name,
          execute: p.execute,
        })),

      request: [...plugins]
        .filter((p) => p.phase === Phase.REQUEST)
        .sort((a, b) => a.order! - b.order!)
        .map((p) => ({
          name: p.name,
          execute: p.execute,
        })),
      response: [...plugins]
        .filter((p) => p.phase === Phase.RESPONSE)
        .sort((a, b) => a.order! - b.order!)
        .map((p) => ({
          name: p.name,
          execute: p.execute,
        })),
    };
    console.info("Pipeline initialized")
  }

  static async run(phase: Phase, ctx: ProxyContext) {
    for (const step of this.pipelines[phase]!) {
      await step.execute(ctx);

      // short circuit
      if (ctx.state.get("STOP")) {
        break;
      }
    }
  }
}
