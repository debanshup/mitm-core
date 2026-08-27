import { BaseHandler } from "./base/base.handler";
import type { RequestScope } from "../scope/types";
import { H1OutboundBridge } from "../transport/http1/H1OutboundBridge";
import { getConfig } from "../../config.registry";

export class ResponseHandler extends BaseHandler {
  /**
   * @override
   */
  readonly phase = "response";

  readonly config = getConfig();
  /**
   * @override
   */
  async handle(scope: RequestScope) {
    return new Promise<void>((resolve, reject) => {
      const { session } = scope;

      if (session.protocol.httpVersion === "h1") {
        H1OutboundBridge.execute(scope, this.config, resolve, reject);
      } else if (session.protocol.httpVersion === "h2") {
        // HTTP/2 later
      } else {
        // Other / unknown protocol
      }
    });
  }
}
