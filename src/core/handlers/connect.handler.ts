import tls from "tls";
import { Phase } from "../../phase/Phase.ts";
import { CertManager } from "../../core/cert-manager/CertManager.ts";
import { createServer } from "http";
import { BaseHandler } from "./base/base.handler.ts";
import type { ProxyContext } from "../../types/types.ts";
import { STATE } from "../state/state.ts";
import { ProxyUtils } from "../utiils/ProxyUtils.ts";
import { Tunnel } from "../direct-tunnel/Tunnel.ts";
import { RuleEngine } from "../rule-manager/RuleEngine.ts";
import { connectionEvents } from "../event-manager/connection-events/connectionEvents.ts";
import { tlsLifecycleEvents } from "../event-manager/tls-event/tlsLifecycleEvents.ts";

export class HandshakeHandler extends BaseHandler {
  static phase = Phase.HANDSHAKE;
  private static httpServer = createServer(
    {
      // insecureHTTPParser: true,
      maxHeaderSize: 10 * 16384,
      keepAlive: true,
    },
    async (req, res) => {
      const parentCtx = (req.socket as any).__ctx as ProxyContext;
      // const reqCtx = ctx.reqCtx;
      try {
        const upstreamHeaders = { ...req.headers };

        const HOP_HEADERS = [
          "connection",
          "keep-alive",
          "transfer-encoding",
          "proxy-authenticate",
          "proxy-authorization",
          "te",
          "trailer",
          "upgrade",
          "via",
          "x-forwarded-for",
          "x-forwarded-host",
          "x-forwarded-proto",
          "forwarded",
        ];
        for (const h of HOP_HEADERS) {
          delete req.headers[h];
        }
        // use an array for deletion
        if (upstreamHeaders["proxy-connection"]) {
          upstreamHeaders["connection" as string] =
            upstreamHeaders["proxy-connection"];
          delete upstreamHeaders["proxy-connection"];
        }
        req.headers = upstreamHeaders;
        parentCtx.requestContext!.req = req;
        parentCtx.requestContext!.res = res;
        connectionEvents.emit("HTTP:DECRYPTED", {
          ctx: parentCtx,
        });
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
      // reqCtx.res = res;
    },
  );
  private static async handleH1Session(
    ctx: ProxyContext,
    tlsSocket: tls.TLSSocket,
  ) {
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
    const { requestContext } = ctx;
    const socket = requestContext.req?.socket;
    // console.info(req, socket);
    if (!requestContext?.req || !socket) {
      return;
    }
    if (requestContext.state.get(STATE.is_finished)) {
      return;
    }
    if (socket.writable && !socket.destroyed) {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    }

    // console.info("head length",ctx.head.length)

    if (ctx.head && ctx.head.length > 0) {
      // console.info("unshifting head")
      socket.unshift(ctx.head);
      ctx.head = null;
    }

    // const { host } = parseConnectData(reqCtx.req);
    const host = ctx.clientToProxyHost;
    if (!host) {
      return;
    }
    // console.info(host)
    const shouldBypass = RuleEngine.shouldBypass(host!);
    // console.info(shouldBypass);
    if (shouldBypass) {
      await Tunnel.createDirectTunnel(ctx);
      return;
    }
    // async-safe
    try {
      await Promise.all(
        tlsLifecycleEvents.listeners("TLS:LEAF_GENERATED").map((listener) => listener({ ctx })),
      );
    } catch (error) {
      throw error;
    }
    let data:
      | {
          key: any;
          cert: any;
        }
      | undefined;
    const customLeaf = ctx.customCertificates?.get(host);
    // console.info("custom leaf for:", host, customLeaf);
    if (customLeaf) {
      data = customLeaf;
    } else {
      data = await CertManager.getCert(host!);
    }

    // console.timeEnd("cert_gen for " + host);
    // tls server
    return new Promise<void>((resolve) => {
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

            const customLeaf = ctx.customCertificates?.get(target);
            let sniData:
              | {
                  key: any;
                  cert: any;
                }
              | undefined;
            if (customLeaf && customLeaf.cert && customLeaf.key) {
              sniData = customLeaf;
            } else {
              sniData = await CertManager.getCert(target);
            }
            const secureContext = tls.createSecureContext({
              key: sniData?.key,
              cert: sniData?.cert,
            });
            cb(null, secureContext);
          } catch (err) {
            console.error(`[Fatal Handshake Error] ${err}`);
            cb(err as Error);
            requestContext.state.set(STATE.is_error, true);
          }
        },
      });

      // timeout for handshake if the client opens the connection but never sends the "ClientHello"
      const handshakeTimeout = setTimeout(() => {
        console.info(
          "socket close! timeout error for",
          requestContext.req?.headers.host,
        );
        ProxyUtils.cleanUp([socket, tlsSocket]);
        requestContext.state.set(STATE.is_error, true);
        resolve();
      }, 10000);

      tlsSocket.on("close", (hadErr) => {
        clearTimeout(handshakeTimeout);

        if (hadErr) {
          console.warn(`[TLS Close] Socket closed due to error for ${host}`);
        }
        // console.info("tls closed", tlsSocket.destroyed)
        ProxyUtils.cleanUp([socket, tlsSocket]);
        resolve();
      });

      tlsSocket.on("secure", async () => {
        if (tlsSocket.alpnProtocol === "h2") {
          // RuleEngine.saveHostToBypass(host);
          await Tunnel.createDirectTunnel(ctx);
          resolve();
          return;
        }
        clearTimeout(handshakeTimeout);
        await HandshakeHandler.handleH1Session(ctx, tlsSocket)!;
        // reqCtx.next_phase = Phase.REQUEST;
        resolve();
      });

      tlsSocket.on("error", (err) => {
        clearTimeout(handshakeTimeout);

        if (err.code === "HPE_HEADER_OVERFLOW") {
          console.info(Buffer.from(err.rawPacket).length, "utf-8");
        }
        console.error(`[TLS Handshake Error] for ${host}:`, err);
        ProxyUtils.cleanUp([socket, tlsSocket]);
        requestContext.state.set(STATE.is_error, true);
        // RuleEngine.saveHostToBypass(host, err);
        resolve();
      });
    });
  }
}
