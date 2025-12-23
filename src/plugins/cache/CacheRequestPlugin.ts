import { Phase } from "../../core/phase/Phase.ts";
import type { Iplugins } from "../../interfaces/IPlugins.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";

export default class CacheRequestPlugin {
  private static registered = false;
  static order = 5;
  static phase = Phase.REQUEST;
  constructor() {
    if (!CacheRequestPlugin.isRegistered()) {
      throw Error("CacheRequestPlugin is not registered");
    }
  }

  public static isRegistered() {
    return CacheRequestPlugin.registered;
  }
  public static register() {
    if (!CacheRequestPlugin.isRegistered()) {
      CacheRequestPlugin.registered = true;
    }
  }
  public static unregister() {
    CacheRequestPlugin.registered = false;
  }

  public static async execute(ctx: ProxyContext) {
    console.info("executing", this);
  }
}
