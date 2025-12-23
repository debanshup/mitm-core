import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";

export default class ResponseHandler {
  static order = 25;
  private static registered = false;
  static phase = Phase.RESPONSE;
  constructor() {
    if (!ResponseHandler.isRegistered()) {
      throw Error("CacheHandler is not registered");
    }
  }

  public static isRegistered() {
    return ResponseHandler.registered;
  }
  public static register() {
    if (!ResponseHandler.isRegistered()) {
      ResponseHandler.registered = true;
    }
  }
  public static unregister() {
    ResponseHandler.registered = false;
  }
  static async execute(ctx: ProxyContext) {
    console.info("executing", this);
  }
}
