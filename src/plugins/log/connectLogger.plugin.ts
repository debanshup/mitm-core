import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../core/types/types.ts";
import { BasePlugin } from "../base/BasePlugin.ts";

export default class ConnectLoggerPlugin extends BasePlugin {
  static phase = Phase.CONNECT;
  static order = 0;

  static async execute(ctx: ProxyContext) {
    console.log("[CONNECT]", ctx.req?.url);
  }
}
