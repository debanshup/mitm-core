import type { Socket } from "net";
import { Phase } from "../../core/phase/Phase.ts";
import { BasePlugin } from "../base/BasePlugin.ts";
import type { ProxyContext } from "../../core/types/types.ts";

export default class ClientSocketErrorLoggerPlugin extends BasePlugin {
  static phase = Phase.TCP;
  static order = 0;

  static async execute(ctx: ProxyContext) {
    if (!ctx.err || !ctx.socket) return;

    console.error("[TCP_CLIENT_ERROR]", ctx.err);
  }
}
