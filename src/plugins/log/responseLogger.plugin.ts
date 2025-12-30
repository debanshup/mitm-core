import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../core/types/types.ts";
import { BasePlugin } from "../base/BasePlugin.ts";

export default class ResponseLoggerPlugin extends BasePlugin {
  static phase = Phase.RESPONSE;
  static order = 0;

  static async execute(ctx: ProxyContext) {
    if (!ctx.res) return;

    console.log(
      "[RES]",
      ctx.req?.method,
      ctx.req?.url,
      ctx.res.statusCode
    );
  }
}
