import { createServer } from "http";
import tls from "tls";
import net from "net";
import { connectionEvents } from "../../event-manager/connection-events/connectionEvents";
import type { ProxyContext } from "../../context-manager/ContextManager";

export class H1SessionBridge {
  private static tlsContextMap = new WeakMap<net.Socket, ProxyContext>();

  private static httpServer = createServer(
    {
      // insecureHTTPParser: true,
      maxHeaderSize: 10 * 16384,
      keepAlive: true,
    },
    async (req, res) => {
      const parentCtx = H1SessionBridge.tlsContextMap.get(req.socket);

      if (!parentCtx) {
        console.error("[Internal Parser Error] Lost proxy context for socket");
        res.destroy();
        return;
      }
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
        if (upstreamHeaders["proxy-connection"]) {
          upstreamHeaders["connection" as string] =
            upstreamHeaders["proxy-connection"];
          delete upstreamHeaders["proxy-connection"];
        }
        req.headers = upstreamHeaders;
        parentCtx.requestContext!.req = req;
        parentCtx.requestContext!.res = res;
        connectionEvents.emit("HTTPS:DECRYPTED", {
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
    },
  );

  public static async bridge(ctx: ProxyContext, tlsSocket: tls.TLSSocket) {
    this.tlsContextMap.set(tlsSocket, ctx);
    this.httpServer.emit("connection", tlsSocket);
  }
}
