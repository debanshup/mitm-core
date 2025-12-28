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

    const { host } = parseConnectData(req);

    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

    // console.time("cert_gen for " + host);

    // get key, cert for host
    const data = await CertManager.getCert(host!);

    // console.timeEnd("cert_gen for " + host);
    // tls server
    const tlsSocket = new tls.TLSSocket(socket, {
      isServer: true,
      cert: data?.cert,
      key: data?.key,
      ALPNProtocols: ["http/1.1"],
    });

    ctx.tlsSocket = tlsSocket;

    // tlsSocket.on("data", (d: Buffer) => {});
    tlsSocket.on("secure", () => {
      // console.info("tls handshake ok");
      ctx.state.set(STATE.CONNECT_HANDLED, true);
      const httpServer = createServer(async (req, res) => {
        const upstreamHeaders = { ...req.headers };
        delete upstreamHeaders["via"];
        delete upstreamHeaders["x-forwarded-for"];
        delete upstreamHeaders["x-forwarded-host"];
        delete upstreamHeaders["x-forwarded-proto"];
        delete upstreamHeaders["forwarded"];
        delete upstreamHeaders["proxy-authorization"];
        delete upstreamHeaders["te"];
        delete upstreamHeaders["trailers"];
        if (upstreamHeaders["proxy-connection"]) {
          upstreamHeaders["connection" as string] =
            upstreamHeaders["proxy-connection"];
          delete upstreamHeaders["proxy-connection"];
        }
        req.headers = upstreamHeaders;
        ctx.req = req;
        ctx.res = res;

        // console.info(
        //   // req.url,
        //   req.headers["proxy-connection"],
        //   req.headers["proxy-authorization"],
        //   req.headers["upgrade"],
        //   req.headers.via
        // );

        try {
          await Pipeline.run(Phase.REQUEST, ctx);
        } catch (error) {
          console.error("Plugin execution failed:", error);
          res.statusCode = 500;
          res.end("Proxy Internal Error");
        }
      });
      httpServer.emit("connection", tlsSocket);
    });
  }
}
