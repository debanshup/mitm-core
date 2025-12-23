import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";

export default class RequestHandler {
  private static registered = false;
  static order = 20;
    static phase = Phase.REQUEST
  constructor() {
    if (!RequestHandler.isRegistered()) {
      throw Error("CacheHandler is not registered");
    }
  }
 
  public static isRegistered() {
    return RequestHandler.registered;
  }
  public static register() {
    if (!RequestHandler.isRegistered()) {
      RequestHandler.registered = true;
    }
  }
  public static unregister() {
    RequestHandler.registered = false; 
  }
  public static async execute(ctx: ProxyContext) {
      console.info("executing", this);
    }
}
