import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";
import { BasePlugin } from "../BasePlugin.ts";

export default class ResponsePlugin extends BasePlugin {
  static order = 20;
  static phase = Phase.REQUEST;
  public static async execute(ctx: ProxyContext) {


  }
}
