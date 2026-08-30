import tls from "tls";
import { CAManager } from "../cert/CAManager";
import { BaseHandler } from "./base/base.handler";
import { ProxyUtils } from "../utils/ProxyUtils";
import type { RequestScope } from "../scope/types";
import { H1InboundBridge } from "../transport/http1/H1InboundBridge";
import { getConfig } from "../../config.registry";
import { proxyEventManager } from "../event/proxy-events/proxyEvents";
import { pluginEventManager } from "../event/plugin-events/pluginEvents";
import { SocketGuard } from "../utils/SocketGuard";
import { PipelineAbortSignal } from "../signals/pipelineAbortSignal";

export class HandshakeHandler extends BaseHandler {
  readonly phase = "handshake";
  readonly config = getConfig();
  async handle(scope: RequestScope) {
    const { request, session, lifecycle } = scope;
    const socket = request.client.req?.socket;
    if (!request?.client.req || !socket) {
      return;
    }
    if (lifecycle.state.get("request.finished")) {
      return;
    }
    const host = request.target.originalHost;
    if (!host) {
      if (socket.writable && !socket.destroyed) {
        socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        socket.destroy();
      }
      return;
    }
    // Inside PipelineCompiler.ts or wherever the phase loop runs
    try {
      await pluginEventManager.emitAsync("proxy:client-before-handshake", {
        scope,
      });
    } catch (err) {
      if (err instanceof PipelineAbortSignal) {
        // Graceful halt! Stop processing this request.
        return;
      }
    }

    try {
      await proxyEventManager.emitAsync("connect:before", {
        socket,
        scope,
      });
    } catch (error) {
      if (!socket.destroyed) socket.destroy();
      return;
    }

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

    if (session.head && session.head.length > 0) {
      // console.info("unshifting head")
      socket.unshift(session.head);
      session.head = null;
    }

    try {
      await pluginEventManager.emitAsync("proxy:client-after-handshake", {
        scope,
      });
      await proxyEventManager.emitAsync("connect:established", {
        socket,
        scope,
      });
    } catch (error) {
      if (!socket.destroyed) socket.destroy();
      return;
    }

    let secureContext;

    const customLeaf = session.customCertificates?.get(host);

    if (customLeaf) {
      secureContext = tls.createSecureContext(customLeaf);
    } else {
      if (this.config.useCertificateCache) {
        secureContext = await CAManager.getCA(host);
      } else {
        secureContext = await CAManager.generateCA(host);
      }
    }

    return new Promise<void>((resolve, reject) => {
      let isSettled = false;

      const tlsSocket = new tls.TLSSocket(socket, {
        isServer: true,
        rejectUnauthorized: false,
        secureContext,
        ALPNProtocols: [
          // "h2",
          "http/1.1",
        ],
        SNICallback: (servername, cb) => {
          (async () => {
            try {
              const target = servername || host;
              if (!target) {
                return cb(new Error("No hostname available for TLS handshake"));
              }

              if (target === host && secureContext) {
                return cb(null, secureContext);
              }

              const customLeaf = session.customCertificates?.get(target);

              if (customLeaf) {
                return cb(null, tls.createSecureContext(customLeaf));
              }
              const ctx = this.config.useCertificateCache
                ? await CAManager.getCA(target)
                : await CAManager.generateCA(target);

              cb(null, ctx);
            } catch (err) {
              console.error(`[Fatal SNI Error] ${err}`);
              lifecycle.state.set("error", true);
              cb(err as Error);
            }
          })();
        },
      });

      SocketGuard.ensureCleanupGuards(tlsSocket);

      const handshakeTimeout = setTimeout(() => {
        if (isSettled) return;
        isSettled = true;
        console.debug(
          `[TLS Timeout] | Host: ${request.client.req?.headers.host}`,
        );
        ProxyUtils.cleanUp([socket, tlsSocket]);
        lifecycle.state.set("request.error", true);
        reject(new Error("TLS Handshake Timeout"));
      }, this.config.handshakeTimeoutMs);

      tlsSocket.on("secure", async () => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(handshakeTimeout);
        const httpVersion = session.protocol.httpVersion;
        try {
          if (httpVersion === "h2") {
            // to be executed
            resolve();
          } else if (httpVersion === "h1") {
            await H1InboundBridge.execute(scope, tlsSocket);
            resolve();
          } else {
          }
        } catch (err) {
          ProxyUtils.cleanUp([socket, tlsSocket]);
          lifecycle.state.set("request.error", true);
          reject(err);
        }
      });

      tlsSocket.on("error", (err: any) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(handshakeTimeout);

        // if (err.code === "HPE_HEADER_OVERFLOW" && err.rawPacket) {
        //   console.error(
        //     "Header Overflow Packet Length:",
        //     Buffer.from(err.rawPacket).length,
        //   );
        // }

        // Suppress normal client aborts, log real errors
        if (err.code !== "ECONNRESET") {
          console.error(`[TLS_ERR] ${host} |`, err.message || err.code);
        }

        lifecycle.state.set("error", true);
        reject(err);
      });
    });
  }
}
