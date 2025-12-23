import { Phase } from "../../core/phase/Phase.ts";
import type { Iplugins } from "../../interfaces/IPlugins.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";

export default class CacheConnectPlugin {
  private static registered = false;
  static order = 5;
  static phase = Phase.CONNECT;

  public static isRegistered() {
    return CacheConnectPlugin.registered;
  }
  public static register() {
    if (!CacheConnectPlugin.isRegistered()) {
      CacheConnectPlugin.registered = true;
    }
  }
  public static unregister() {
    CacheConnectPlugin.registered = false;
  }
  constructor() {
    if (!CacheConnectPlugin.isRegistered()) {
      throw Error("CacheConnectPlugin is not registered");
    }
  }

  public static async execute(ctx: ProxyContext) {
    console.info("executing", this.name);
  }
}
