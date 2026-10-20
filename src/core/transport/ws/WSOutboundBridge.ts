import WebSocket, { WebSocketServer } from "ws";
import type { RequestScope } from "../../scope/types";
import {
  pluginEventManager,
  type WsMessageContext,
} from "../../event/plugin-events/pluginEvents";
import {
  proxyEventManager,
  reportProxyError,
} from "../../event/proxy-events/proxyEvents";
import { ProxyUtils } from "../../utils/ProxyUtils";
import { WSUpstreamInitiator } from "./WSUpstreamInitiator";
import { ScopeMutator } from "../../scope/ScopeMutator";

export class WSOutboundBridge {
  private static async handleMessageSafely(
    operation: () => Promise<void>,
    onError: (error: unknown) => void,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      reportProxyError(error);

      try {
        onError(error);
      } catch (cleanupError) {
        console.error(
          "[WSOutboundBridge] Message failure cleanup failed:",
          cleanupError,
        );
      }
    }
  }
  public static async execute(scope: RequestScope): Promise<void> {
    const { request } = scope;
    const req = request.client.req;

    if (!req) throw new Error("[WS] Request object missing from context");
    if (!request.webSocket) throw new Error("[WS] WebSocket context missing");

    const clientSocket = request.webSocket.rawUpgradeSocket;
    const head = request.webSocket.upgradeHead!;
    const upstreamUrl = request.target.url;

    if (!clientSocket) throw new Error("[WS] Client socket missing");
    if (!upstreamUrl) throw new Error("[WS] Upstream URL missing");

    const targetUrl = new URL(upstreamUrl);
    const upstreamReq = WSUpstreamInitiator.init(targetUrl, scope);

    // CATCH HANDSHAKE FAILURE
    upstreamReq.on("error", (err) => {
      console.error("[WS_UPSTREAM_FAILED]", {
        target: targetUrl.href,
        code: (err as NodeJS.ErrnoException).code,
        message: err.message,
        stack: err.stack,
      });
      if (clientSocket.writable && !clientSocket.destroyed) {
        clientSocket.write(
          "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n",
        );
        clientSocket.end();
      }
      ProxyUtils.cleanUp([clientSocket]);
    });

    // HANDSHAKE SUCCESS
    upstreamReq.on(
      "upgrade",
      async (upstreamRes, upstreamSocket, upstreamHead) => {
        if ((upstreamSocket as any).setNoDelay)
          (upstreamSocket as any).setNoDelay(true);
        if ((clientSocket as any).setNoDelay)
          (clientSocket as any).setNoDelay(true);

        let isTornDown = false;
        const isolateTunnelTearDown = (
          err?: Error | null,
          originChannel?: string,
        ) => {
          if (isTornDown) return;

          isTornDown = true;

          if (err) {
            console.error(
              `[WS_INFRA_FAILURE] [${originChannel}] Stream Exception:`,
              err.message,
            );
          }

          ProxyUtils.cleanUp([clientSocket, upstreamSocket]);

          ScopeMutator.finishPipeline(scope);
        };

        try {
          await pluginEventManager.emitAsync("proxy:client-upgrade", { scope });

          const proxyWSS = new WebSocketServer({
            noServer: true,
            perMessageDeflate: true,
          });
          const subprotocol = upstreamRes.headers["sec-websocket-protocol"];
          const protocolString = Array.isArray(subprotocol)
            ? subprotocol[0]
            : subprotocol;

          const clientWS = await new Promise<WebSocket>((resolve) => {
            proxyWSS.handleUpgrade(req, clientSocket, head, (ws) => {
              resolve(ws);
            });
          });

          const upstreamWS = new WebSocket(null as any, protocolString, {
            autoPong: true,
            perMessageDeflate: true,
          });
          (upstreamWS as any)._isServer = false;

          (upstreamWS as any).setSocket(upstreamSocket, upstreamHead, {
            maxPayload: 100 * 1024 * 1024,
            autoPong: true,
            skipUTF8Validation: false,
          });

          request.upstream.req = upstreamReq;
          request.upstream.res = upstreamRes;

          if (request.webSocket) {
            request.webSocket.isUpgraded = true;
            request.webSocket.client = clientWS;
            request.webSocket.upstream = upstreamWS;
            request.webSocket.subprotocol = Array.isArray(subprotocol)
              ? subprotocol.join(", ")
              : subprotocol;
          }

          clientWS.on("message", (data, isBinary) => {
            void this.handleMessageSafely(
              () =>
                this.handleClientMessage(
                  scope,
                  data as Buffer,
                  isBinary,
                  upstreamWS,
                ),
              (error) =>
                isolateTunnelTearDown(error as Error, "Client_Message_Handler"),
            );
          });

          upstreamWS.on("message", (data, isBinary) => {
            void this.handleMessageSafely(
              () =>
                this.handleUpstreamMessage(
                  scope,
                  data as Buffer,
                  isBinary,
                  clientWS,
                ),
              (error) =>
                isolateTunnelTearDown(
                  error as Error,
                  "Upstream_Message_Handler",
                ),
            );
          });
          const getSafeCloseCode = (code?: number) => {
            if (!code) return 1000;
            // 1004, 1005, 1006, and 1015 are internal/reserved and will crash if sent over the wire
            const isReserved =
              code === 1004 || code === 1005 || code === 1006 || code === 1015;
            return isReserved ? 1001 : code; // 1001 = "Going Away"
          };

          // Lifecycle Teardown

          clientWS.on("close", (code, reason) => {
            void (async () => {
              try {
                await proxyEventManager.emitAsync("ws:close", {
                  scope,
                  direction: "client",
                  code,
                  reason,
                });
              } catch (error) {
                reportProxyError(error);
              } finally {
                if (upstreamWS.readyState === WebSocket.OPEN) {
                  upstreamWS.close(
                    getSafeCloseCode(code),
                    reason ? reason.toString("utf8") : undefined,
                  );
                  upstreamSocket.once("close", () =>
                    isolateTunnelTearDown(null, "Client_Normal_Close"),
                  );
                  setTimeout(
                    () => isolateTunnelTearDown(null, "Client_Close_Timeout"),
                    1000,
                  ).unref();
                } else {
                  isolateTunnelTearDown(null, "Client_Normal_Close");
                }
              }
            })();
          });

          upstreamWS.on("close", async (code, reason) => {
            try {
              await proxyEventManager.emitAsync("ws:close", {
                scope,
                direction: "upstream",
                code,
                reason,
              });
            } catch (error) {
              reportProxyError(error);
            } finally {
              if (clientWS.readyState === WebSocket.OPEN) {
                clientWS.close(
                  getSafeCloseCode(code),
                  reason ? reason.toString("utf8") : undefined,
                );
                clientSocket.once("close", () =>
                  isolateTunnelTearDown(null, "Upstream_Normal_Close"),
                );
                setTimeout(
                  () => isolateTunnelTearDown(null, "Upstream_Close_Timeout"),
                  1000,
                ).unref();
              } else {
                isolateTunnelTearDown(null, "Upstream_Normal_Close");
              }
            }
          });

          clientWS.on("error", (err) => {
            void (async () => {
              try {
                await proxyEventManager.emitAsync("ws:error", {
                  scope,
                  direction: "client",
                  error: err,
                });
              } catch (reportingError) {
                reportProxyError(reportingError);
              } finally {
                isolateTunnelTearDown(err, "Client_WS_Engine");
              }
            })();
          });
          upstreamWS.on("error", (err) => {
            void (async () => {
              try {
                await proxyEventManager.emitAsync("ws:error", {
                  scope,
                  direction: "upstream",
                  error: err,
                });
              } catch (reportingError) {
                reportProxyError(reportingError);
              } finally {
                isolateTunnelTearDown(err, "Upstream_WS_Engine");
              }
            })();
          });

          // emit proxy event
          await proxyEventManager.emitAsync("ws:established", { scope });
        } catch (bootstrapError: any) {
          isolateTunnelTearDown(bootstrapError, "Bootstrap_Setup_Fatal");
        }
      },
    );

    try {
      await pluginEventManager.emitAsync("proxy:upstream-dispatch", { scope });
      upstreamReq.end();
    } catch (error: unknown) {
      const dispatchError =
        error instanceof Error ? error : new Error(String(error));

      upstreamReq.destroy();
      ProxyUtils.cleanUp([clientSocket]);
      ScopeMutator.finishPipeline(scope);

      reportProxyError(dispatchError);
    }
  }

  private static async handleClientMessage(
    scope: RequestScope,
    rawData: Buffer,
    rawIsBinary: boolean,
    upstreamWS: WebSocket,
  ): Promise<void> {
    const messageContext: WsMessageContext = {
      data: rawData,
      isBinary: rawIsBinary,
      drop: false,
    };

    await pluginEventManager.emitAsync("proxy:ws-client-message", {
      scope,
      messageContext,
    });

    if (messageContext.drop) return;

    if (upstreamWS.readyState === WebSocket.OPEN) {
      upstreamWS.send(messageContext.data, { binary: messageContext.isBinary });
    }

    await proxyEventManager.emitAsync("ws:client-message", {
      data: rawData,
      isBinary: rawIsBinary,
      scope,
    });
  }

  private static async handleUpstreamMessage(
    scope: RequestScope,
    rawData: Buffer,
    rawIsBinary: boolean,
    clientWS: WebSocket,
  ): Promise<void> {
    const messageContext: WsMessageContext = {
      data: rawData,
      isBinary: rawIsBinary,
      drop: false,
    };

    await pluginEventManager.emitAsync("proxy:ws-upstream-message", {
      scope,
      messageContext,
    });

    if (messageContext.drop) return;

    if (clientWS.readyState === WebSocket.OPEN) {
      clientWS.send(messageContext.data, { binary: messageContext.isBinary });
    }
    await proxyEventManager.emitAsync("ws:upstream-message", {
      data: rawData,
      isBinary: rawIsBinary,
      scope,
    });
  }
}
