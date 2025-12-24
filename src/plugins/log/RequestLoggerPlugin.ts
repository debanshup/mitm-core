import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";
import { BasePlugin } from "../BasePlugin.ts";

export default class RequestLoggerPlugin extends BasePlugin {
  static phase = Phase.REQUEST;
  static order = 0;
  static async execute(ctx: ProxyContext) {
    const { method, url } = ctx.req!;
    console.log("[REQ]", method, url);
  }
}
