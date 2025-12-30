import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../core/types/types.ts";
import { BasePlugin } from "../base/BasePlugin.ts";

export default class ResponseErrorLoggerPlugin extends BasePlugin {
  static phase = Phase.RESPONSE;
  static order = 0;

  static async execute(ctx: ProxyContext) {
    if (!ctx.err) return;

    console.error("[UPSTREAM_ERROR]", ctx.err);
  }
}
