import net from "node:net";
import { BasePlugin, type RequestScope, Proxy } from "../../src";

class CustomConnectTunnel extends BasePlugin<"proxy:client-connect"> {
  readonly event = "proxy:client-connect";

  async run({ scope }: { scope: RequestScope }): Promise<void> {
    const clientSocket = scope.session.socket;
    const authority = scope.request.target.originalUrl;

    if (!clientSocket || clientSocket.destroyed || !authority) {
      return;
    }

    let target: URL;

    try {
      target = new URL(`http://${authority}`);
    } catch {
      clientSocket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      scope.lifecycle.isHijacked = true;
      return;
    }

    const host = target.hostname;
    const port = Number(target.port) || 443;

    // Take ownership before the normal CONNECT handler runs.
    scope.lifecycle.isHijacked = true;

    const upstreamSocket = net.connect({ host, port });

    upstreamSocket.once("connect", () => {
      if (clientSocket.destroyed) {
        upstreamSocket.destroy();
        return;
      }

      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

      // Forward any bytes received with the CONNECT request.
      const head = scope.session.head;

      if (head?.length) {
        upstreamSocket.write(head);
        scope.session.head = null;
      }

      clientSocket.pipe(upstreamSocket);
      upstreamSocket.pipe(clientSocket);
    });

    upstreamSocket.once("error", () => {
      if (!clientSocket.destroyed && !clientSocket.writableEnded) {
        clientSocket.end(
          "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n",
        );
      }
    });

    clientSocket.once("close", () => {
      if (!upstreamSocket.destroyed) {
        upstreamSocket.destroy();
      }
    });

    upstreamSocket.once("close", () => {
      if (!clientSocket.destroyed) {
        clientSocket.destroy();
      }
    });
  }
}

const proxy = new Proxy();

proxy.use(new CustomConnectTunnel());

void proxy.listen(8080);
