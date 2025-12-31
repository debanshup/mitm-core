import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../types/types.ts";
import { BaseHandler } from "./base/base.handler.ts";

export class ResponseHandler extends BaseHandler {
  /**
   * @override
   */
  static phase = Phase.REQUEST;
   /**
   * @override
   */
  public static async execute(ctx: ProxyContext) {


  }
}
