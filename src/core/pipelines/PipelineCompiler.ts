import { unlink } from "fs";
import type { Plugin } from "../../plugins/PluginRegistry.ts";
import { Phase } from "../phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";

export class PipelineCompiler {
  static compile(plugins: Set<Plugin>) {
    return {
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
  }
}
