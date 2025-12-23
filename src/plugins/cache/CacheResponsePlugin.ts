import { Phase } from "../../core/phase/Phase.ts";
import type { Iplugins } from "../../interfaces/IPlugins.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";

export default class CacheResponsePlugin {
  private static registered = false;
  static order = 5;
  static phase = Phase.RESPONSE;
  constructor() {
    if (!CacheResponsePlugin.isRegistered()) {
      throw Error("CacheResponsePlugin is not registered");
    }
  }

  public static isRegistered() {
    return CacheResponsePlugin.registered;
  }
  public static register() {
    if (!CacheResponsePlugin.isRegistered()) {
      CacheResponsePlugin.registered = true;
    }
  }
  public static unregister() {
    CacheResponsePlugin.registered = false;
  }
  public static async execute(ctx: ProxyContext) {
      console.info("executing", this);
    }
}
