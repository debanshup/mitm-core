import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";
import { BasePlugin } from "../BasePlugin.ts";

export default class ResponseErrorLoggerPlugin extends BasePlugin {
  static phase = Phase.RESPONSE;
  static order = 0;

  static async execute(ctx: ProxyContext) {
    if (!ctx.err) return;

    console.error("[UPSTREAM_ERROR]", ctx.err);
  }
}
