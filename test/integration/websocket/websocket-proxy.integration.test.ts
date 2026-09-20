import assert from "assert";
import http from "http";
import https from "https";
import net from "net";
import { WebSocket, WebSocketServer } from "ws";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

import fs from "fs";
import path from "path";

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
});
