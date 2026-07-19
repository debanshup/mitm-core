/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
import { BaseHandler } from "./base/base.handler";
import type { RequestScope } from "../context-manager/types";
import { H1OutboundBridge } from "./transport/http1/H1OutboundBridge";
import type { ProxyConfig } from "../../lib/Proxy";
import { getConfig } from "../../config.registry";

export class ResponseHandler extends BaseHandler {
  /**
   * @override
   */
  readonly phase = "response";

  readonly config = getConfig();

  // /**
  //  * @use it while modiying response data
  //  */

  // private static modifier = new Transform({
  //   transform(chunk, encoding, callback) {
  //     let data = chunk.toString();
  //     const modifiedData = data;
  //     callback(null, modifiedData);
  //   },
  // });

  /**
   * @override
   */
  async handle(scope: RequestScope) {
    // console.info("r- handler");

    return new Promise<void>((resolve, reject) => {
      const { sessionContext } = scope;

      if (sessionContext.httpVersion === "h1") {
        H1OutboundBridge.execute(scope, this.config, resolve, reject);
      } else if (sessionContext.httpVersion === "h2") {
        //  http 2
      } else {
        //  other
      }
    });
  }
}
