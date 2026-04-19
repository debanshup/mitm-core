import type { Socket } from "node:net";
import type { Phase } from "../../phase/Phase";
import type { ProxyContext } from "../context-manager/ContextManager";
import { BaseHandler } from "./base/base.handler";
import { ProxyUtils } from "../utils/ProxyUtils";

export class TcpHandler extends BaseHandler {
  readonly phase: Phase = "tcp";
  async handle(ctx: ProxyContext): Promise<void> {
    const socket = ctx.socket;

    (socket as Socket).setNoDelay(true);

    socket.on("error", (err: any) => {
      ProxyUtils.cleanUp([socket]);
      ctx.error = err;

      if (ctx.requestContext) {
        ctx.requestContext.state.set("error", true);
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
      if (ctx.requestContext) {
        ctx.requestContext.state.set("isFinished", true);
      }
    });
  }
}
