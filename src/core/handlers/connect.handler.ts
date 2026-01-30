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
import { Tunnel } from "../direct-tunnel/Tunnel.ts";
import { RuleEngine } from "../rule-manager/RuleEngine.ts";

export class HandshakeHandler extends BaseHandler {
  static phase = Phase.HANDSHAKE;
  private static httpServer = createServer(async (req, res) => {
    const ctx = (req.socket as any).__ctx as ProxyContext;
    const reqCtx = ctx.reqCtx;
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
    // ctx.tlsSocket = tlsSocket;
    reqCtx.next_phase = Phase.REQUEST;
    await Pipeline.run(ctx);

    // console.info(reqCtx.next_phase)
  });
  private static handleH1Session(ctx: ProxyContext, tlsSocket: tls.TLSSocket) {
    // console.log(
    //   "Server hash:",
    //   this.httpServer.constructor.name,
    //   this.httpServer.listenerCount("request"),
    // );

    (tlsSocket as any).__ctx = ctx;
    this.httpServer.emit("connection", tlsSocket);
  }
  private static handleH2Session(ctx: ProxyContext, tlsSocket: tls.TLSSocket) {
    /**
     * @todo: implement this
     */
  }

  public static async handle(ctx: ProxyContext) {
    const { reqCtx } = ctx;
    const socket = reqCtx.req?.socket;
    // console.info(req, socket);
    if (!reqCtx?.req || !socket) {
      return;
    }
    if (reqCtx.state.get(STATE.is_finished)) {
      return;
    }
    if (socket.writable && !socket.destroyed) {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    }
    
    const { host } = parseConnectData(reqCtx.req);
    if (!host) {
      return;
    }
    // console.info(host)
    const shouldBypass = RuleEngine.shouldBypass(host!)
    // console.info(shouldBypass);
    if (shouldBypass) {
      await Tunnel.createDirectTunnel(ctx);
      return;
    }
    
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
      ALPNProtocols: ['http/1.1'],
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
      console.error(`[TLS Handshake Error] for ${host}:`, err.code);
      ProxyUtils.cleanUp([socket, tlsSocket]);
      reqCtx.state.set(STATE.is_error, true);
      RuleEngine.saveHostToBypass(host, err)
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
      ProxyUtils.cleanUp([socket, tlsSocket]);
      reqCtx.state.set(STATE.is_error, true);

      // console.info(socket.closed, tlsSocket.closed);
    }, 10000);

    tlsSocket.on("secure", async () => {
      
      // console.info(tlsSocket.alpnProtocol, "for", host);
      if (tlsSocket.alpnProtocol === "h2") {
        await Tunnel.createDirectTunnel(ctx);
        return;
      }
      clearTimeout(handshakeTimeout);
      HandshakeHandler.handleH1Session(ctx, tlsSocket)!;
      // RuleEngine.saveHostToBypass(host, new Error())
    });
  }
}
