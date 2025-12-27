import { Phase } from "../../core/phase/Phase.ts";
import type { Iplugins } from "../../interfaces/IPlugins.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";
import { BasePlugin } from "../BasePlugin.ts";

export default class CacheResponsePlugin extends BasePlugin {
  static order = 5;
  static phase = Phase.RESPONSE;
  
  public static async execute(ctx: ProxyContext) {


  }
}
