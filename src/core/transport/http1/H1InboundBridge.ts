import { createServer } from "http";
import type { TLSSocket } from "tls";
import { randomUUID } from "crypto";

import type { RequestScope } from "../../scope/types";
import { connectionEvents } from "../../event/connection-events/connectionEvents";

const HOP_HEADERS = new Set([
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
  "proxy-connection",
]);

export class H1InboundBridge {
  private static h1Server = createServer({
    maxHeaderSize: 10 * 16384,
    keepAlive: true,
  });

  static {
    this.h1Server.on("clientError", (err, socket) => {
      console.error("[H1InboundBridge] Client HTTP Parser Fault:", err.message);
      if (socket.writable) {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      }
      socket.destroy();
    });

    this.h1Server.on("request", async (req, res) => {
      const connectionScope = (req.socket as any)
        .__connectionScope as RequestScope;

      if (!connectionScope) {
        req.destroy();
        return;
      }
 
      const requestScope: RequestScope = {
        session: connectionScope.session,
        request: {
          requestId: randomUUID(),
          client: {
            req,
            res,
            method: req.method,
            url: req.url,
          },
          upstream: {},
          target: { ...connectionScope.request?.target },
        },
        lifecycle: {
          state: connectionScope.lifecycle.state,
          isHijacked: false,
          timestamps: {
            receivedAt: Date.now(),
          },
        },
      };

      try {
 
        const cleanedHeaders: Record<string, any> = {};

        for (const [key, value] of Object.entries(req.headers)) {
          const lowerKey = key.toLowerCase();

          if (!HOP_HEADERS.has(lowerKey)) {
            cleanedHeaders[key] = value;
          }
        }

        req.headers = cleanedHeaders;
        requestScope.request.client.headers = cleanedHeaders;

        await connectionEvents.emitAsync("HTTPS:DECRYPTED", {
          scope: requestScope,
        });
      } catch (err) {
        console.error("[Internal H1 Bridge Parser Error]", err);

        if (!res.headersSent) {
          res.statusCode = 502;
          res.end("Bad Gateway (Proxy Core Fault)");
        } else {
          res.destroy();
        }

        if (!req.socket.destroyed) {
          req.socket.destroy();
        }
      }
    });
  }

  /**
   * Routes an established, cleartext TLSSocket into the HTTP/1.1 parsing machine
   */
  public static async execute(
    scopeTemplate: RequestScope,
    tlsSocket: TLSSocket,
  ): Promise<void> {
 
    (tlsSocket as any).__connectionScope = scopeTemplate;
    this.h1Server.emit("connection", tlsSocket);
  }
}
