import type { Socket } from "node:net";
import type { Phase } from "../../phase/Phase";
import type { RequestScope } from "../context-manager/types";
import { BaseHandler } from "./base/base.handler";
import { ProxyUtils } from "../utils/ProxyUtils";
import { getConfig } from "../../config.registry";

export class TcpHandler extends BaseHandler {
  readonly config = getConfig();
  readonly phase: Phase = "tcp";
  async handle(scope: RequestScope): Promise<void> {
    const { sessionContext, requestContext , lifecycle} = scope;
    const socket = sessionContext.socket;

    (socket as Socket).setNoDelay(true);

    socket.on("error", (err: any) => {
      ProxyUtils.cleanUp([socket]);
      sessionContext.error = err;

      if (requestContext) {
        lifecycle.state.set("error", true);
      }

      const isExpectedDrop =
        err.code === "ECONNABORTED" ||
        err.code === "ECONNRESET" ||
        err.code === "EPIPE";

      if (!isExpectedDrop) {
        console.error(
          `[TCP_CLIENT_ERROR] ${err.code || "UNKNOWN"}:`,
          err.message,
        );
      }
    });
    socket.on("close", () => {
      ProxyUtils.cleanUp([socket]);
      if (requestContext) {
        lifecycle.state.set("isFinished", true);
      }
    });
  }
}
