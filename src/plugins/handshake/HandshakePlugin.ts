import tls from "tls";
import { Phase } from "../../core/phase/Phase.ts";
import { STATE, type ProxyContext } from "../../middleware/middleware.ts";
import { parseConnectData } from "../../utils/parser/parseReqData.ts";
import { BasePlugin } from "../BasePlugin.ts";
import { CertManager } from "../../core/cert-manager/CertManager.ts";
import { createServer, IncomingMessage } from "http";
import { request } from "https";
import { Pipeline } from "../../core/pipelines/PipelineCompiler.ts";

export default class HandshakePlugin extends BasePlugin {
  static order = 10;
  static phase = Phase.CONNECT;
  public static async execute(ctx: ProxyContext) {
    const { socket, req } = ctx;
    // console.info(req, socket);
    if (!req || !socket) {
      return;
    }
    if (ctx.state.get(STATE.CONNECT_HANDLED)) {
      return;
    }

    const { host, port } = parseConnectData(req);

    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

    // get key, cert for host
    const { cert, key } = await CertManager.getCert(host!);
    // tls server
    const tlsSocket = new tls.TLSSocket(socket, {
      isServer: true,
      cert,
      key,
      ALPNProtocols: ["http/1.1"],
    });

    ctx.tlsSocket = tlsSocket;

    // tlsSocket.on("data", (d: Buffer) => {});
    tlsSocket.on("secure", () => {
      // console.info("tls handshake ok");
      ctx.state.set(STATE.CONNECT_HANDLED, true);
      const httpServer = createServer(async (req, res) => {
        (ctx.req = req), (ctx.res = res);
        await Pipeline.run(Phase.RESPONSE, ctx)
      });
      httpServer.emit("connection", tlsSocket);
    });
  }
}
