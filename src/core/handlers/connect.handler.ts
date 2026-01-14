import tls from "tls";
import { Phase } from "../../core/phase/Phase.ts";
import { parseConnectData } from "../../utils/parser/parseReqData.ts";
import { CertManager } from "../../core/cert-manager/CertManager.ts";
import { createServer } from "http";
import { BaseHandler } from "./base/base.handler.ts";
import type { ProxyContext } from "../types/types.ts";
import { STATE } from "../state/state.ts";
import { ProxyUtils } from "../utiils/ProxyUtils.ts";

import Pipeline from "../pipelines/PipelineCompiler.ts";

// import { Pipeline } from "../../core/pipelines/PipelineCompiler.ts";
export class HandshakeHandler extends BaseHandler {
  static phase = Phase.HANDSHAKE;
  public static async handle(ctx: ProxyContext) {
    const { socket, reqCtx } = ctx;
    // console.info(req, socket);
    if (!reqCtx?.req || !socket) {
      return;
    }
    if (reqCtx.state.get(STATE.finished)) {
      return;
    }

    const { host } = parseConnectData(reqCtx.req);

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
          reqCtx.state.set(STATE.is_error, true);
        }
      },
    });

    tlsSocket.on("error", (err) => {
      console.error(`[TLS Handshake Error] for ${host}:`, err.message);
      ProxyUtils.cleanUp([socket, tlsSocket]);
      reqCtx.state.set(STATE.is_error, true);
    });

    tlsSocket.on("close", (hadErr) => {
      if (hadErr) {
        console.warn(`[TLS Close] Socket closed due to error for ${host}`);
      }
      // console.info("tls closed", tlsSocket.destroyed)
      ProxyUtils.cleanUp([socket, tlsSocket]);
    });

    // timeout for handshake if the client opens the connection but never sends the "ClientHello"
    const handshakeTimeout = setTimeout(() => {
      // console.error(`[Handshake Timeout] for ${host}`);
      // create tunnel instread of interception
      ProxyUtils.cleanUp([socket, tlsSocket]);
      reqCtx.state.set(STATE.is_error, true);

      // console.info(socket.closed, tlsSocket.closed);
    }, 10000);

    // tlsSocket.on("timeout", ()=>{

    // })

    // tlsSocket.on("data", (d: Buffer) => {});
    tlsSocket.on("secure", () => {
      // console.info("tls handshake ok");
      clearTimeout(handshakeTimeout);
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
          ctx.reqCtx!.req = req;
          ctx.reqCtx!.res = res;
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
        reqCtx.res = res;
        ctx.tlsSocket = tlsSocket;
        reqCtx.next_phase = Phase.REQUEST;
        // console.info(reqCtx.next_phase)

        await Pipeline.run(ctx);
      });
      httpServer.emit("connection", tlsSocket);
    });
  }
}
