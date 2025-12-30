import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../core/types/types.ts";
import { BasePlugin } from "../base/BasePlugin.ts";

export default class RequestLoggerPlugin extends BasePlugin {
  static phase = Phase.REQUEST;
  static order = 0;
  static async execute(ctx: ProxyContext) {
    const { method, url } = ctx.req!;
    console.log("[REQ]", method, url);
  }
}
