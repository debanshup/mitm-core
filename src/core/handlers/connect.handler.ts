import tls from "tls";
import { CAManager } from "../cert-manager/CAManager";
import { BaseHandler } from "./base/base.handler";
import { ProxyUtils } from "../utils/ProxyUtils";
import { connectionEvents } from "../event-manager/connection-events/connectionEvents";
import type { RequestScope } from "../context-manager/types";
// import { H2InboundBridge } from "./transport/http2/H2InboundBridge";
import { H1InboundBridge } from "./transport/http1/H1InboundBridge";
import { normalizeHttpVersion } from "./utils/utils";
import { getConfig } from "../../config.registry";

export class HandshakeHandler extends BaseHandler {
  readonly phase = "handshake";
  readonly config = getConfig();
  async handle(scope: RequestScope) {
    const { requestContext, sessionContext, lifecycle } = scope;
    const socket = requestContext.req?.socket;
    if (!requestContext?.req || !socket) {
      return;
    }
    if (lifecycle.state.get("isFinished")) {
      return;
    }
    const host = requestContext.clientToProxyHost;
    if (!host) {
      if (socket.writable && !socket.destroyed) {
        socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        socket.destroy();
      }
      return;
    }




    // console.info("socket:", socket.writable);
    await connectionEvents.emitAsync("CONNECT:PRE_ESTABLISH", {
      scope,
      socket,
    });
    await new Promise<void>((resolve, reject) => {
      if (!socket.writable || socket.destroyed) return resolve();
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n", (err) => {
        if (err) {
          return reject(err);
        } else {
          resolve();
        }
      });
    });
    // console.info("socket:", socket.writable);

    // console.info("head length",sessionContext.head.length)

    if (sessionContext.head && sessionContext.head.length > 0) {
      // console.info("unshifting head")
      socket.unshift(sessionContext.head);
      sessionContext.head = null;
    }

    await connectionEvents.emitAsync("CONNECT:ESTABLISHED", { scope, socket });
    let data:
      | {
          key: any;
          cert: any;
        }
      | undefined;


    const customLeaf = sessionContext.customCertificates?.get(host);

    if (customLeaf) {
      data = customLeaf;
    } else {
      // console.info(config)
      if (this.config.useCertificateCache) {
        data = await CAManager.getCA(host);
      } else {
        data = await CAManager.generateCA(host);
      }
    }


    return new Promise<void>((resolve, reject) => {
      let isSettled = false; // GUARD: Prevents double resolve/reject race conditions

      //  Timeout Guard
      const handshakeTimeout = setTimeout(() => {
        if (isSettled) return;
        isSettled = true;

        console.warn(
          `[TLS Timeout] | Host: ${requestContext.req?.headers.host}`,
        );
        ProxyUtils.cleanUp([socket, tlsSocket]);
        lifecycle.state.set("error", true);
        reject(new Error("TLS Handshake Timeout"));
      }, this.config.handshakeTimeoutMs);

      // tls server

      const tlsSocket = new tls.TLSSocket(socket, {
        isServer: true,
        cert: data?.cert,
        key: data?.key,
        ALPNProtocols: [
          // "h2",
          "http/1.1",
        ], // Forces browser to downgrade to HTTP/1.1
        SNICallback: async (servername, cb) => {
          try {
            const target = servername || host;
            if (!target) {
              return cb(new Error("No hostname available for TLS handshake"));
            }

            const customLeaf = sessionContext.customCertificates?.get(target);
            const sniData =
              customLeaf && customLeaf.cert && customLeaf.key
                ? customLeaf
                : this.config.useCertificateCache
                  ? await CAManager.getCA(target)
                  : await CAManager.generateCA(target);

            const secureContext = tls.createSecureContext({
              key: sniData?.key,
              cert: sniData?.cert,
            });

            cb(null, secureContext);
          } catch (err) {
            console.error(`[Fatal SNI Error] ${err}`);
            lifecycle.state.set("error", true);
            cb(err as Error); // This will naturally trigger the tlsSocket "error" event below
          }
        },
      });

      // handshake completed
      tlsSocket.on("secure", async () => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(handshakeTimeout);

        const normalizedVersion = normalizeHttpVersion(tlsSocket.alpnProtocol);
        sessionContext.httpVersion = normalizedVersion;
        try {
          if (normalizedVersion === "h2") {
            // to be executed
            // await H2InboundBridge.execute(scope, tlsSocket);
            resolve();
          } else if (normalizedVersion === "h1") {
            await H1InboundBridge.execute(scope, tlsSocket);
            resolve();
          } else {
            // if no version is defined -> create fallback
          }
        } catch (err) {
          // Catch any errors that happen during the H1 parsing phase
          ProxyUtils.cleanUp([socket, tlsSocket]);
          lifecycle.state.set("error", true);
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
        lifecycle.state.set("error", true);
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
