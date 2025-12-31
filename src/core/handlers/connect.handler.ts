import tls from "tls";
import { Phase } from "../../core/phase/Phase.ts";
import { parseConnectData } from "../../utils/parser/parseReqData.ts";
import { CertManager } from "../../core/cert-manager/CertManager.ts";
import { createServer } from "http";
import { Pipeline } from "../../core/pipelines/PipelineCompiler.ts";
import { BaseHandler } from "./base/base.handler.ts";
import type { ProxyContext } from "../types/types.ts";
import { STATE } from "../state/state.ts";
import { ProxyUtils } from "../utiils/ProxyUtils.ts";
export class HandshakeHandler extends BaseHandler {
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
    const data = await CertManager.getCert(host!);

    // console.timeEnd("cert_gen for " + host);
    // tls server
    const tlsSocket = new tls.TLSSocket(socket, {
      isServer: true,
      cert: data?.cert,
      key: data?.key,
      /**
       * @implement later for http/2
       */
      ALPNProtocols: ["http/1.1"],
      SNICallback: async (servername, cb) => {
        try {
          const target = servername || host;
          if (!target) {
            return cb(new Error("No hostname available for TLS handshake"));
          }
          const data = await CertManager.getCert(target);
          const secureContext = tls.createSecureContext({
            key: data?.key,
            cert: data?.cert,
          });
          cb(null, secureContext);
        } catch (err) {
          console.error(`[Fatal Handshake Error] ${err}`);
          cb(err as Error);
        }
      },
    });
    tlsSocket.on("error", (err) => {
      console.error("[Socket destroyed]", socket.destroyed, "for", host);
      console.error("[TLS Socket destroyed]", tlsSocket.destroyed, "for", host);
      // console.error(`[TLS Handshake Error] for ${host}:`, err.message);
      ProxyUtils.cleanUp([socket, tlsSocket]);
    });

    ctx.tlsSocket = tlsSocket;

    // timeout for handshake if the client opens the connection but never sends the "ClientHello"
    const handshakeTimeout = setTimeout(() => {
      console.error(`[Handshake Timeout] for ${host}`);
      // create tunnel instread of interception

      ProxyUtils.cleanUp([socket, tlsSocket]);

    }, 10000);

    tlsSocket.on("close", (hadErr) => {
      if (hadErr) {
        console.warn(`[TLS Close] Socket closed due to error for ${host}`);
      }
      // console.info("tls closed", tlsSocket.destroyed)
      ProxyUtils.cleanUp([socket, tlsSocket]);
    });

    // tlsSocket.on("data", (d: Buffer) => {});
    tlsSocket.on("secure", () => {
      clearTimeout(handshakeTimeout);
      // console.info("tls handshake ok");
      ctx.state.set(STATE.CONNECT_HANDLED, true);
      const httpServer = createServer(async (req, res) => {
        // error handler for internal parser
        try {
          const upstreamHeaders = { ...req.headers };
          // use an array for deletion
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
        } catch (err) {
          console.error("[Internal Parser Error]", err);
          if (!req.socket.destroyed) req.socket.destroy();
          if (!res.headersSent) {
            res.statusCode = 502;
            res.end("Bad Gateway");
          } else {
            res.destroy();
          }
        }
        await Pipeline.run(Phase.REQUEST, ctx);
      });
      httpServer.emit("connection", tlsSocket);
    });
  }
}
