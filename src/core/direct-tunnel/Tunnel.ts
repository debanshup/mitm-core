import type { ProxyContext } from "../types/types.ts";
import { BYPASS_RULES } from "./rules.ts";
import http from "http";
import net from "net";
export class Tunnel {
  protected constructor() {}
  static shouldBypass(req: http.IncomingMessage): boolean {
    // console.info(BYPASS_RULES);
    const host = req.url?.split(":")[0]!;
    // console.info(host);
    const result = BYPASS_RULES.some((r) => r.test(host));
    return result;
  }

  static async createDirectTunnel(ctx: ProxyContext) {
    //   const { req, res, socket } = ctx;
    console.info("Direct tunnel to", ctx.reqCtx.req?.headers.host);

    // const reqCtx = ctx.reqCtx
    const req = ctx.reqCtx.req;
    const socket = req?.socket!

    const hostHeader = req!.headers.host!;
    const [host, portStr] = hostHeader.split(":");
    const port = Number(portStr) || 443;

    const upstream = net.connect(port, host, () => {
      // socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      socket!.pipe(upstream);
      upstream.pipe(socket!);
    });

    upstream.on("error", (err) => {
      console.error("Direct tunnel error:", err.message);
      socket?.destroy();
    });

    upstream.setNoDelay(true);
  }
}
