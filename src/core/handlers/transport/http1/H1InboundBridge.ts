/**
 * @todo check Socket Cleanup
 */

import { createServer } from "http";
import type { TLSSocket } from "tls";
import type { RequestScope } from "../../../context-manager/types";
import { connectionEvents } from "../../../event-manager/connection-events/connectionEvents";
import { parseBody, readStream } from "../../utils/utils";
import { Readable } from "stream";

// A Set provides O(1) lookups and avoids iterating an array during requests
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
]);

const METHOD_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class H1InboundBridge {
  private static h1Server = createServer(
    {
      maxHeaderSize: 10 * 16384,
      keepAlive: true,
    },
    async (req, res) => {
      // Safely fetch attached context from socket metadata hook
      const requestScope = (req.socket as any).__scope as RequestScope;

      // console.info(req.socket)

      const { requestContext } = requestScope;

      try {
        const cleanedHeaders = { ...req.headers };

        // STRIP HOP-BY-HOP HEADERS
        for (const key of Object.keys(cleanedHeaders)) {
          if (HOP_HEADERS.has(key.toLowerCase())) {
            delete cleanedHeaders[key];
          }
        }

        // NORMALIZE PROXY-CONNECTION
        if (cleanedHeaders["proxy-connection"]) {
          cleanedHeaders["connection"] = cleanedHeaders[
            "proxy-connection"
          ] as string;
          delete cleanedHeaders["proxy-connection"];
        }

        req.headers = cleanedHeaders;
        requestContext!.req = req;
        requestContext!.res = res;

        const method = req?.method?.toUpperCase()!;
        const headers = req.headers;
        requestContext.requestHeaders = headers;
        requestContext.requestMethod = method;

        if (METHOD_WITH_BODY.has(method)) {
          const originalReq = requestContext.req;
          if (!originalReq) return;

          try {
            const rawBuffer = await readStream(originalReq);

            const body = parseBody(
              rawBuffer,
              originalReq.headers["content-encoding"],
            );

            requestContext.requestBody = body;

            // Create a fresh stream out of the buffer
            const freshStream = Readable.from(rawBuffer);

            //  Wrap it in a Proxy to transparently preserve headers, socket, and methods
            const proxiedReq = new Proxy(freshStream, {
              get(target, prop, receiver) {
                if (prop in target) {
                  return Reflect.get(target, prop, receiver);
                }
                return Reflect.get(originalReq, prop);
              },
              set(target, prop, value, receiver) {
                return Reflect.set(originalReq, prop, value);
              },
            });

            //  Replace context request with proxy
            requestContext.req = proxiedReq as any;
          } catch (error) {
            console.error("Error capturing request body:", error);
          }
        }

        //  get global config from registry
        connectionEvents.emit("HTTPS:DECRYPTED", { scope: requestScope });
      } catch (err) {
        console.error("[Internal H1 Bridge Parser Error]", err);

        if (!res.headersSent) {
          res.statusCode = 502;
          res.end("Bad Gateway");
        } else {
          res.destroy();
        }

        if (!req.socket.destroyed) {
          req.socket.destroy();
        }
      }
    },
  );

  /**
   * Routes an established, cleartext TLSSocket into the HTTP/1.1 parsing machine
   */
  public static async execute(
    scope: RequestScope,
    tlsSocket: TLSSocket,
  ): Promise<void> {
    // Attach context as a non-enumerable reference tag on the socket structure
    (tlsSocket as any).__scope = scope;

    // Trigger internal HTTP engine request cycles manually
    this.h1Server.emit("connection", tlsSocket);
  }
}
