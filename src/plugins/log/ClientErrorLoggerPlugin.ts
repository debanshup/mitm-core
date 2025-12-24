import type { Socket } from "net";
import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";
import { BasePlugin } from "../BasePlugin.ts";

export default class ClientSocketErrorLoggerPlugin extends BasePlugin {
  static phase = Phase.TCP;
  static order = 0;

  static async execute(ctx: ProxyContext) {
    if (!ctx.err || !ctx.socket) return;

    console.error("[TCP_CLIENT_ERROR]", ctx.err);
  }
}
