import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";

export default class HandshakeHandler {
  private static registered = false;
  static order = 10;
  static phase = Phase.CONNECT;

  constructor() {
    if (!HandshakeHandler.isRegistered()) {
      throw Error("CacheHandler is not registered");
    }
  }

  public static isRegistered() {
    return HandshakeHandler.registered;
  }
  public static register() {
    if (!HandshakeHandler.isRegistered()) {
      HandshakeHandler.registered = true;
    }
  }
  public static unregister() {
    HandshakeHandler.registered = false;
  }

  public static async execute(ctx: ProxyContext) {
    console.info("executing", this);
  }
}
