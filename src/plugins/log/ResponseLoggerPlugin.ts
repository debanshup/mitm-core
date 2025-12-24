import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";
import { BasePlugin } from "../BasePlugin.ts";

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
