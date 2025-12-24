import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";
import { BasePlugin } from "../BasePlugin.ts";

export default class HandshakeHandler extends BasePlugin{
  static order = 10;
  static phase = Phase.CONNECT;
  public static async execute(ctx: ProxyContext) {
  }
  
}
