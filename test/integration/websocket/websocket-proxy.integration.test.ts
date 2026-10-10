import assert from "assert";
import http from "http";
import https from "https";
import net from "net";
import { WebSocket, WebSocketServer } from "ws";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import fs from "fs";
import path from "path";

import { ContextManager } from "../../../src/core/scope/ContextManager";
import { Proxy } from "../../../src/lib/Proxy";

const CA_CERT = fs.readFileSync("creds/__self__/CA.pem", "utf8");
const CA_KEY = fs.readFileSync("creds/__self__/key.pem", "utf8");

const UPSTREAM_KEY = fs.readFileSync(
  path.resolve("test/fixtures/certs/upstream-key.pem"),
);

const UPSTREAM_CERT = fs.readFileSync(
  path.resolve("test/fixtures/certs/upstream-cert.pem"),
);

describe("WebSocket Proxy Integration", () => {
  let upstream: http.Server;
  let wsUpstream: WebSocketServer;

  let proxy: Proxy;

  let upstreamPort: number;
  let proxyPort: number;

  let wssUpstream: https.Server;
  let wss: WebSocketServer;
  let wssUpstreamPort: number;

  beforeEach(async () => {
    upstream = http.createServer();

    wsUpstream = new WebSocketServer({
      server: upstream,
    });

    wssUpstream = https.createServer({
      key: UPSTREAM_KEY,
      cert: UPSTREAM_CERT,
    });

    wsUpstream.on("connection", (socket) => {
      socket.on("message", (message) => {
        socket.send(message);
      });
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
    });

    proxy = new Proxy({
      useDefaultPipelines: true,
      useCertificateCache: false,
      useResponseCache: false,
      rootCa: {
        cert: CA_CERT,
        key: CA_KEY,
      },
    });

    await new Promise<void>((resolve) => {
      proxy.listen(0, resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    proxyPort = (proxy.address() as net.AddressInfo).port;

    wss = new WebSocketServer({
      server: wssUpstream,
    });

    wss.on("connection", (socket) => {
      socket.on("message", (message) => {
        socket.send(message);
      });
    });

    await new Promise<void>((resolve) => {
      wssUpstream.listen(0, "127.0.0.1", () => resolve());
    });

    wssUpstreamPort = (wssUpstream.address() as net.AddressInfo).port;
  });

  afterEach(async () => {
    await proxy.stop();

    await new Promise<void>((resolve) => {
      if (!upstream.listening) {
        resolve();
        return;
      }

      upstream.close(() => resolve());
    });

    await new Promise<void>((resolve) => {
      if (!wssUpstream.listening) {
        resolve();
        return;
      }

      wssUpstream.close(() => resolve());
    });
  });

  it("should establish a WebSocket connection through the proxy", async () => {
    const agent = new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`);

    const ws = new WebSocket(`ws://127.0.0.1:${upstreamPort}`, {
      agent,
    });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => {
        resolve();
      });

      ws.once("error", reject);
    });

    assert.equal(ws.readyState, WebSocket.OPEN);

    ws.close();

    await new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
    });
  });

  it("should forward WebSocket messages through the proxy", async () => {
    const agent = new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`);

    const ws = new WebSocket(`ws://127.0.0.1:${upstreamPort}`, {
      agent,
    });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    const response = await new Promise<string>((resolve, reject) => {
      ws.once("message", (message) => {
        resolve(message.toString());
      });

      ws.once("error", reject);

      ws.send("hello from ws client");
    });

    assert.equal(response, "hello from ws client");

    ws.close();

    await new Promise<void>((resolve) => {
      ws.once("close", resolve);
    });
  });

  it("should forward multiple WebSocket messages through the proxy", async () => {
    const agent = new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`);

    const ws = new WebSocket(`ws://127.0.0.1:${upstreamPort}`, {
      agent,
    });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    const messages = ["first message", "second message", "third message"];

    const received: string[] = [];

    const completed = new Promise<void>((resolve, reject) => {
      ws.on("message", (message) => {
        received.push(message.toString());

        if (received.length === messages.length) {
          resolve();
        }
      });

      ws.once("error", reject);
    });

    for (const message of messages) {
      ws.send(message);
    }

    await completed;

    assert.deepEqual(received, messages);

    ws.close();

    await new Promise<void>((resolve) => {
      ws.once("close", resolve);
    });
  });

  it("should propagate WebSocket close through the proxy", async () => {
    const agent = new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`);

    const upstreamClosed = new Promise<void>((resolve) => {
      wsUpstream.once("connection", (socket) => {
        socket.once("close", () => resolve());
      });
    });

    const ws = new WebSocket(`ws://127.0.0.1:${upstreamPort}`, { agent });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    ws.close();

    await new Promise<void>((resolve, reject) => {
      ws.once("close", resolve);
      ws.once("error", reject);
    });

    await upstreamClosed;
  });

  it("should establish a WSS connection through the proxy", async () => {
    const agent = new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`);

    const ws = new WebSocket(`wss://localhost:${wssUpstreamPort}`, {
      agent,
      rejectUnauthorized: false,
    });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    assert.equal(ws.readyState, WebSocket.OPEN);

    ws.close();

    await new Promise<void>((resolve) => {
      ws.once("close", resolve);
    });
  });

  it("should forward WSS messages through the proxy", async () => {
    const agent = new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`);

    const ws = new WebSocket(`wss://localhost:${wssUpstreamPort}`, {
      agent,
      rejectUnauthorized: false,
    });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    const response = await new Promise<string>((resolve, reject) => {
      ws.once("message", (message) => {
        resolve(message.toString());
      });

      ws.once("error", reject);

      ws.send("hello from wss client");
    });

    assert.equal(response, "hello from wss client");

    ws.close();

    await new Promise<void>((resolve) => {
      ws.once("close", resolve);
    });
  });

  it("should forward multiple WSS messages through the proxy", async () => {
    const agent = new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`);

    const ws = new WebSocket(`wss://localhost:${wssUpstreamPort}`, {
      agent,
      rejectUnauthorized: false,
    });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    const messages = [
      "first wss message",
      "second wss message",
      "third wss message",
    ];

    const received: string[] = [];

    const completed = new Promise<void>((resolve, reject) => {
      ws.on("message", (message) => {
        received.push(message.toString());

        if (received.length === messages.length) {
          resolve();
        }
      });

      ws.once("error", reject);
    });

    for (const message of messages) {
      ws.send(message);
    }

    await completed;

    assert.deepEqual(received, messages);

    ws.close();

    await new Promise<void>((resolve) => {
      ws.once("close", resolve);
    });
  });

  it("should propagate WSS close through the proxy", async () => {
    const agent = new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`);

    const upstreamClosed = new Promise<void>((resolve) => {
      wss.once("connection", (socket) => {
        socket.once("close", () => resolve());
      });
    });

    const ws = new WebSocket(`wss://localhost:${wssUpstreamPort}`, {
      agent,
      rejectUnauthorized: false,
    });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    ws.close();

    await new Promise<void>((resolve, reject) => {
      ws.once("close", resolve);
      ws.once("error", reject);
    });

    await upstreamClosed;
  });

  it("should close the upstream WS connection when the client terminates abruptly", async function () {
    this.timeout(5000);

    let upstreamConnected = false;
    let upstreamClosed = false;
    const activeRequestsBefore = ContextManager.getActiveRequests().length;
    const upstreamClosedPromise = new Promise<void>((resolve) => {
      wsUpstream.once("connection", (socket) => {
        upstreamConnected = true;

        socket.once("close", () => {
          upstreamClosed = true;
          resolve();
        });
      });
    });

    const client = new WebSocket(`ws://127.0.0.1:${upstreamPort}/abnormal`, {
      agent: new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`),
    });

    client.on("error", () => {
      // Expected when the client is terminated.
    });

    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });

    assert.equal(upstreamConnected, true);

    // Abruptly terminate the underlying WebSocket connection.
    client.terminate();

    await Promise.race([
      upstreamClosedPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Upstream WS connection did not close"));
        }, 3000);
      }),
    ]);

    assert.equal(upstreamClosed, true);
    assert.equal(
      client.readyState,
      WebSocket.CLOSED,
      "Expected downstream WS to close after upstream termination",
    );

    const cleanupDeadline = Date.now() + 3000;

    while (
      ContextManager.getActiveRequests().length > activeRequestsBefore &&
      Date.now() < cleanupDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.equal(
      ContextManager.getActiveRequests().length,
      activeRequestsBefore,
      "Expected the WS request context to be removed after tunnel teardown",
    );
  });

  it("should close the upstream WSS connection when the client terminates abruptly", async function () {
    this.timeout(5000);

    let upstreamConnected = false;
    let upstreamClosed = false;
    const activeRequestsBefore = ContextManager.getActiveRequests().length;
    const upstreamClosedPromise = new Promise<void>((resolve) => {
      wss.once("connection", (socket) => {
        upstreamConnected = true;

        socket.once("close", () => {
          upstreamClosed = true;
          resolve();
        });
      });
    });

    const client = new WebSocket(
      `wss://localhost:${wssUpstreamPort}/abnormal`,
      {
        agent: new HttpsProxyAgent(`http://localhost:${proxyPort}`),
        rejectUnauthorized: false,
      },
    );

    client.on("error", () => {
      // Expected when the client is terminated.
    });

    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });

    assert.equal(upstreamConnected, true);

    // Abruptly terminate the underlying WebSocket connection.
    client.terminate();

    await Promise.race([
      upstreamClosedPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Upstream WSS connection did not close"));
        }, 3000);
      }),
    ]);

    assert.equal(upstreamClosed, true);
    assert.equal(
      client.readyState,
      WebSocket.CLOSED,
      "Expected downstream WSS to close after upstream termination",
    );
    const cleanupDeadline = Date.now() + 3000;

    while (
      ContextManager.getActiveRequests().length > activeRequestsBefore &&
      Date.now() < cleanupDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.equal(
      ContextManager.getActiveRequests().length,
      activeRequestsBefore,
      "Expected the WSS request context to be removed after tunnel teardown",
    );
  });

  it("should close the client WS connection when the upstream terminates abruptly", async function () {
    this.timeout(5000);

    let upstreamSocket: import("ws").WebSocket | undefined;

    const upstreamConnected = new Promise<void>((resolve) => {
      wsUpstream.once("connection", (socket) => {
        upstreamSocket = socket;
        resolve();
      });
    });

    const client = new WebSocket(
      `ws://127.0.0.1:${upstreamPort}/upstream-abort`,
      {
        agent: new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`),
      },
    );

    client.on("error", () => {
      // Abrupt termination can surface as a connection error.
    });

    const clientClosed = new Promise<number>((resolve) => {
      client.once("close", (code) => resolve(code));
    });

    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });

    await upstreamConnected;

    assert.ok(upstreamSocket, "Expected upstream WebSocket to connect");

    // Destroy the transport without a WebSocket close handshake.
    upstreamSocket!.terminate();

    await clientClosed;

    assert.equal(
      client.readyState,
      WebSocket.CLOSED,
      "Expected downstream WS to close after upstream termination",
    );
  });

  it("should close the client WSS connection when the upstream terminates abruptly", async function () {
    this.timeout(5000);

    let upstreamSocket: import("ws").WebSocket | undefined;

    const upstreamConnected = new Promise<void>((resolve) => {
      wss.once("connection", (socket) => {
        upstreamSocket = socket;
        resolve();
      });
    });

    const client = new WebSocket(
      `wss://localhost:${wssUpstreamPort}/upstream-abort`,
      {
        agent: new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`),
        rejectUnauthorized: false,
      },
    );

    client.on("error", () => {
      // Abrupt termination can surface as a connection error.
    });

    const clientClosed = new Promise<number>((resolve) => {
      client.once("close", (code) => resolve(code));
    });

    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });

    await upstreamConnected;

    assert.ok(upstreamSocket, "Expected upstream WSS to connect");

    // Destroy the transport without a WebSocket close handshake.
    upstreamSocket!.terminate();

    await clientClosed;

    assert.equal(
      client.readyState,
      WebSocket.CLOSED,
      "Expected downstream WSS to close after upstream termination",
    );
  });
});
