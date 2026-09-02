import WebSocket, { WebSocketServer } from "ws";
import type { RequestScope } from "../../scope/types";
import { pluginEventManager } from "../../event/plugin-events/pluginEvents";
import { ProxyUtils } from "../../utils/ProxyUtils";
import { WSUpstreamInitiator } from "./WSUpstreamInitiator";

export class WSOutboundBridge {
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

        await pluginEventManager.emitAsync("proxy:client-upgrade", { scope });

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
          } else {
            console.info(
              `[WS_TUNNEL_CLOSED] Connection terminated cleanly for: ${targetUrl.host}`,
            );
          }
          ProxyUtils.cleanUp([clientSocket, upstreamSocket]);
        };

        try {
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
            void this.handleClientMessage(
              scope,
              data as Buffer,
              isBinary,
              upstreamWS,
            );
          });

          upstreamWS.on("message", (data, isBinary) => {
            void this.handleUpstreamMessage(
              scope,
              data as Buffer,
              isBinary,
              clientWS,
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
            if (upstreamWS.readyState === WebSocket.OPEN) {
              upstreamWS.close(
                getSafeCloseCode(code),
                reason ? reason.toString("utf8") : "",
              );
            }
            isolateTunnelTearDown(null, "Client_Normal_Close");
          });

          upstreamWS.on("close", (code, reason) => {
            if (clientWS.readyState === WebSocket.OPEN) {
              clientWS.close(
                getSafeCloseCode(code),
                reason ? reason.toString("utf8") : "",
              );
            }
            isolateTunnelTearDown(null, "Upstream_Normal_Close");
          });
          clientWS.on("error", (err) =>
            isolateTunnelTearDown(err, "Client_WS_Engine"),
          );
          upstreamWS.on("error", (err) =>
            isolateTunnelTearDown(err, "Upstream_WS_Engine"),
          );
        } catch (bootstrapError: any) {
          isolateTunnelTearDown(bootstrapError, "Bootstrap_Setup_Fatal");
        }
      },
    );

    await pluginEventManager.emitAsync("proxy:upstream-dispatch", { scope });

    upstreamReq.end();
  }

  private static async handleClientMessage(
    scope: RequestScope,
    rawData: Buffer,
    rawIsBinary: boolean,
    upstreamWS: WebSocket,
  ): Promise<void> {
    const messageContext = {
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
  }

  private static async handleUpstreamMessage(
    scope: RequestScope,
    rawData: Buffer,
    rawIsBinary: boolean,
    clientWS: WebSocket,
  ): Promise<void> {
    const messageContext = {
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
  }
}
