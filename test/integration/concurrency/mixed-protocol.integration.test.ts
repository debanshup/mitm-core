import http from "http";
import https from "https";
import net from "net";
import { Proxy } from "../../../src/lib/Proxy";
import fs from "fs";
import { makeHttpsProxyRequest } from "./concurrency.integration.test";
import assert from "assert";
import { HttpsProxyAgent } from "https-proxy-agent";
import { WebSocket, WebSocketServer } from "ws";
import { HttpProxyAgent } from "http-proxy-agent";

const CA_CERT = fs.readFileSync("creds/__self__/CA.pem", "utf8");
const CA_KEY = fs.readFileSync("creds/__self__/key.pem", "utf8");

const UPSTREAM_CERT = fs.readFileSync("test/fixtures/certs/upstream-cert.pem");
const UPSTREAM_KEY = fs.readFileSync("test/fixtures/certs/upstream-key.pem");

export async function makeHttpRequest(
  proxyPort: number,
  upstreamPort: number,
  path: string,
): Promise<{
  statusCode?: number;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: `http://127.0.0.1:${upstreamPort}${path}`,
      },
      (res) => {
        let body = "";

        res.on("data", (chunk) => {
          body += chunk.toString();
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body,
          });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}
function makeWssRequest(
  proxyPort: number,
  upstreamPort: number,
  message: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://localhost:${upstreamPort}`, {
      agent: new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`),
      rejectUnauthorized: false,
    });

    ws.once("open", () => {
      ws.send(message);
    });

    ws.once("message", (data) => {
      resolve(data.toString());
      ws.close();
    });

    ws.once("error", reject);
  });
}
export async function makeWsRequest(
  proxyPort: number,
  upstreamPort: number,
  message: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${upstreamPort}`, {
      agent: new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`),
    });

    let settled = false;

    const resolveOnce = (value: string) => {
      if (settled) return;

      settled = true;
      resolve(value);

      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;

      settled = true;
      reject(error);

      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    };

    ws.once("open", () => {
      ws.send(message);
    });

    ws.once("message", (data) => {
      resolveOnce(data.toString());
    });

    ws.once("error", rejectOnce);

    ws.once("close", () => {
      if (!settled) {
        rejectOnce(new Error("WS connection closed before receiving response"));
      }
    });
  });
}
describe("Proxy Mixed Protocol Concurrency Integration", () => {
  let httpUpstream: http.Server;
  let httpsUpstream: https.Server;
  let wsUpstream: http.Server;
  let wssUpstream: https.Server;

  let wsServer: WebSocketServer;
  let wssServer: WebSocketServer;

  let proxy: Proxy;

  let httpUpstreamPort: number;
  let httpsUpstreamPort: number;
  let wsUpstreamPort: number;
  let wssUpstreamPort: number;
  let proxyPort: number;

  beforeEach(async () => {
    // Start HTTP upstream
    httpUpstream = http.createServer((req, res) => {
      const body = req.url ?? "";

      res.writeHead(200, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(body),
        connection: "close",
      });

      res.end(body);
    });

    await new Promise<void>((resolve) => {
      httpUpstream.listen(0, "127.0.0.1", resolve);
    });

    // Start HTTPS upstream
    httpsUpstream = https.createServer(
      {
        key: UPSTREAM_KEY,
        cert: UPSTREAM_CERT,
      },
      (req, res) => {
        const body = req.url ?? "";

        res.writeHead(200, {
          "content-type": "text/plain",
          "content-length": Buffer.byteLength(body),
          connection: "close",
        });

        res.end(body);
      },
    );

    await new Promise<void>((resolve) => {
      httpsUpstream.listen(0, "127.0.0.1", resolve);
    });

    // Start WS upstream
    wsUpstream = http.createServer();

    wsServer = new WebSocketServer({
      server: wsUpstream,
    });

    wsServer.on("connection", (socket) => {
      socket.on("message", (message) => {
        socket.send(message);
      });
    });

    await new Promise<void>((resolve) => {
      wsUpstream.listen(0, "127.0.0.1", resolve);
    });

    // Start WSS upstream
    wssUpstream = https.createServer({
      key: UPSTREAM_KEY,
      cert: UPSTREAM_CERT,
    });

    wssServer = new WebSocketServer({
      server: wssUpstream,
    });

    wssServer.on("connection", (socket) => {
      socket.on("message", (message) => {
        socket.send(message);
      });
    });

    await new Promise<void>((resolve) => {
      wssUpstream.listen(0, "127.0.0.1", resolve);
    });

    // Start proxy
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

    httpUpstreamPort = (httpUpstream.address() as net.AddressInfo).port;

    httpsUpstreamPort = (httpsUpstream.address() as net.AddressInfo).port;

    wsUpstreamPort = (wsUpstream.address() as net.AddressInfo).port;

    wssUpstreamPort = (wssUpstream.address() as net.AddressInfo).port;

    proxyPort = (proxy.address() as net.AddressInfo).port;
  });

  afterEach(async () => {
    await proxy.stop();

    await Promise.all([
      new Promise<void>((resolve) => {
        if (!httpUpstream.listening) return resolve();
        httpUpstream.close(() => resolve());
      }),

      new Promise<void>((resolve) => {
        if (!httpsUpstream.listening) return resolve();
        httpsUpstream.close(() => resolve());
      }),

      new Promise<void>((resolve) => {
        if (!wsUpstream.listening) return resolve();
        wsUpstream.close(() => resolve());
      }),

      new Promise<void>((resolve) => {
        if (!wssUpstream.listening) return resolve();
        wssUpstream.close(() => resolve());
      }),
    ]);
  });

  it("should handle mixed HTTP, HTTPS, WS and WSS concurrency", async () => {
    const requestCount = 25;

    const httpRequests = Array.from({ length: requestCount }, (_, index) =>
      makeHttpRequest(proxyPort, httpUpstreamPort, `/http-${index}`),
    );

    const httpsRequests = Array.from({ length: requestCount }, (_, index) =>
      makeHttpsProxyRequest(proxyPort, httpsUpstreamPort, `/https-${index}`),
    );

    const wsRequests = Array.from({ length: requestCount }, (_, index) =>
      makeWsRequest(proxyPort, wsUpstreamPort, `ws-${index}`),
    );

    const wssRequests = Array.from({ length: requestCount }, (_, index) =>
      makeWssRequest(proxyPort, wssUpstreamPort, `wss-${index}`),
    );

    const [httpResponses, httpsResponses, wsResponses, wssResponses] =
      await Promise.all([
        Promise.all(httpRequests),
        Promise.all(httpsRequests),
        Promise.all(wsRequests),
        Promise.all(wssRequests),
      ]);

    assert.equal(httpResponses.length, requestCount);
    assert.equal(httpsResponses.length, requestCount);
    assert.equal(wsResponses.length, requestCount);
    assert.equal(wssResponses.length, requestCount);

    for (let index = 0; index < requestCount; index++) {
      assert.equal(httpResponses[index].statusCode, 200);

      assert.equal(httpResponses[index].body, `/http-${index}`);

      assert.equal(httpsResponses[index].statusCode, 200);

      assert.equal(httpsResponses[index].body, `/https-${index}`);

      assert.equal(wsResponses[index], `ws-${index}`);

      assert.equal(wssResponses[index], `wss-${index}`);
    }
  });
});
