import tls from "tls";
import { CertManager } from "../../core/cert-manager/CertManager";
import { BaseHandler } from "./base/base.handler";
import { ProxyUtils } from "../utils/ProxyUtils";
import { connectionEvents } from "../event-manager/connection-events/connectionEvents";
import { H1SessionBridge } from "./bridge/H1SessionBridge";
import type { ProxyContext } from "../context-manager/ContextManager";

export class HandshakeHandler extends BaseHandler {
  readonly phase = "handshake";

  async handle(ctx: ProxyContext) {
    const { requestContext } = ctx;
    const socket = requestContext.req?.socket;
    // console.info(req, socket);
    if (!requestContext?.req || !socket) {
      return;
    }
    if (requestContext.state.get("isFinished")) {
      return;
    }
    const host = ctx.clientToProxyHost;
    if (!host) {
      if (socket.writable && !socket.destroyed) {
        socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        socket.destroy();
      }
      return;
    }

    await connectionEvents.emitAsync("CONNECT:PRE_ESTABLISH", { ctx, socket });
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

    await connectionEvents.emitAsync("CONNECT:ESTABLISHED", { ctx, socket });
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
    return new Promise<void>((resolve, reject) => {
      let isSettled = false; // GUARD: Prevents double resolve/reject race conditions

      // 1. Timeout Guard
      const handshakeTimeout = setTimeout(() => {
        if (isSettled) return;
        isSettled = true;

        console.warn(
          `[TLS Timeout] | Host: ${requestContext.req?.headers.host}`,
        );
        ProxyUtils.cleanUp([socket, tlsSocket]);
        requestContext.state.set("error", true);
        reject(new Error("TLS Handshake Timeout"));
      }, 10000);

      // 2. Socket Creation
      const tlsSocket = new tls.TLSSocket(socket, {
        isServer: true,
        cert: data?.cert,
        key: data?.key,
        ALPNProtocols: ["http/1.1"], // Forces browser to downgrade to HTTP/1.1
        SNICallback: async (servername, cb) => {
          try {
            const target = servername || host;
            if (!target) {
              return cb(new Error("No hostname available for TLS handshake"));
            }

            const customLeaf = ctx.customCertificates?.get(target);
            const sniData =
              customLeaf && customLeaf.cert && customLeaf.key
                ? customLeaf
                : await CertManager.getCert(target);

            const secureContext = tls.createSecureContext({
              key: sniData?.key,
              cert: sniData?.cert,
            });

            cb(null, secureContext);
          } catch (err) {
            console.error(`[Fatal SNI Error] ${err}`);
            requestContext.state.set("error", true);
            cb(err as Error); // This will naturally trigger the tlsSocket "error" event below
          }
        },
      });

      // 3. Lifecycle Events
      tlsSocket.on("secure", async () => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(handshakeTimeout);

        try {
          // Handshake is done! Hand it over to the H1SessionBridge.
          await H1SessionBridge.bridge(ctx, tlsSocket);
          resolve();
        } catch (err) {
          // Catch any errors that happen during the H1 parsing phase
          ProxyUtils.cleanUp([socket, tlsSocket]);
          requestContext.state.set("error", true);
          reject(err);
        }
      });

      tlsSocket.on("error", (err: any) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(handshakeTimeout);

        if (err.code === "HPE_HEADER_OVERFLOW" && err.rawPacket) {
          console.info(
            "Header Overflow Packet Length:",
            Buffer.from(err.rawPacket).length,
          );
        }

        // Suppress normal client aborts, log real errors
        if (err.code !== "ECONNRESET") {
          console.error(`[TLS_ERR] ${host} |`, err.message || err.code);
        }

        ProxyUtils.cleanUp([socket, tlsSocket]);
        requestContext.state.set("error", true);
        reject(err);
      });

      tlsSocket.on("close", (hadErr) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(handshakeTimeout);

        if (hadErr) {
          console.warn(`[TLS Close] Socket closed abruptly for ${host}`);
        }

        ProxyUtils.cleanUp([socket, tlsSocket]);
        resolve();
      });
    });
  }
}
