import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { HttpProxyAgent } from "http-proxy-agent";

import { Proxy } from "../../../src/lib/Proxy";
import { BasePlugin } from "../../../src/core/plugin/BasePlugin";

class RejectUpstreamDispatchPlugin extends BasePlugin<"proxy:upstream-dispatch"> {
  readonly event = "proxy:upstream-dispatch" as const;

  invoked = false;

  async run(): Promise<void> {
    this.invoked = true;
    throw new Error("intentional upstream-dispatch failure");
  }
}

describe("WebSocket upstream-dispatch plugin failure", function () {
  this.timeout(5000);

  let upstream: http.Server;
  let upstreamWSS: WebSocketServer;
  let proxy: Proxy;
  let dispatchPlugin: RejectUpstreamDispatchPlugin;
  let upstreamSockets: Set<net.Socket>;

  beforeEach(async () => {
    upstream = http.createServer();
    upstreamWSS = new WebSocketServer({ server: upstream });
    upstreamSockets = new Set<net.Socket>();

    upstream.on("connection", (socket) => {
      upstreamSockets.add(socket);
      socket.once("close", () => upstreamSockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      upstream.once("error", reject);
      upstream.listen(0, "127.0.0.1", resolve);
    });

    proxy = new Proxy({
      useDefaultPipelines: true,
      useCertificateCache: false,
      useResponseCache: false,
    });

    dispatchPlugin = new RejectUpstreamDispatchPlugin();
    proxy.use(dispatchPlugin);

    await proxy.listen(0);
  });

  afterEach(async function () {
    this.timeout(10000);

    await proxy.stop();

    // Terminate any WebSocket clients still tracked by ws.
    for (const client of upstreamWSS.clients) {
      client.terminate();
    }

    // Force-close every underlying TCP connection.
    for (const socket of upstreamSockets) {
      socket.destroy();
    }

    // Close the WebSocket server and its attached HTTP server.
    await new Promise<void>((resolve, reject) => {
      if (!upstream.listening) {
        resolve();
        return;
      }

      upstream.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    // Remove the WebSocket server's listeners after the HTTP server closes.
    await new Promise<void>((resolve) => {
      upstreamWSS.close(() => resolve());
    });
  });

  it("should terminate the client connection when upstream-dispatch rejects", async () => {
    const upstreamAddress = upstream.address() as net.AddressInfo;
    const proxyAddress = proxy.address() as net.AddressInfo;

    const ws = new WebSocket(
      `ws://127.0.0.1:${upstreamAddress.port}/plugin-failure`,
      {
        agent: new HttpProxyAgent(`http://127.0.0.1:${proxyAddress.port}`),
      },
    );

    const outcome = await new Promise<"open" | "error" | "close">(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          ws.terminate();
          reject(
            new Error(
              "WebSocket connection hung after upstream-dispatch rejection",
            ),
          );
        }, 3000);

        const finish = (result: "open" | "error" | "close") => {
          clearTimeout(timer);
          resolve(result);
        };

        ws.once("open", () => finish("open"));
        ws.once("error", () => finish("error"));
        ws.once("close", () => finish("close"));
      },
    );

    assert.equal(
      dispatchPlugin.invoked,
      true,
      "The upstream-dispatch plugin should have been invoked",
    );

    assert.notEqual(
      outcome,
      "open",
      "The WebSocket must not open after the dispatch plugin rejects",
    );

    if (ws.readyState !== WebSocket.CLOSED) {
      ws.terminate();
    }
  });
});
