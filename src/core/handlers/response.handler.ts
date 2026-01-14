import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../types/types.ts";
import { BaseHandler } from "./base/base.handler.ts";
import Pipeline from "../pipelines/PipelineCompiler.ts";


export class ResponseHandler extends BaseHandler {
  /**
   * @override
   */
  static phase = Phase.RESPONSE;
  /**
   * @override
   */
  public static async handle(ctx: ProxyContext) {
    console.info("r- handler");
  }
}



