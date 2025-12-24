import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";
import { BasePlugin } from "../BasePlugin.ts";

export default class ConnectLoggerPlugin extends BasePlugin {
  static phase = Phase.CONNECT;
  static order = 0;

  static async execute(ctx: ProxyContext) {
    console.log("[CONNECT]", ctx.req?.url);
  }
}
