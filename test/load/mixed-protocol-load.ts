import assert from "node:assert";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

import { WebSocket, WebSocketServer } from "ws";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

import { Proxy } from "../../src/lib/Proxy";
import { ContextManager } from "../../src/core/scope/ContextManager";
import { connectionManager } from "../../src/core/connection/ConnectionManager";

const CLIENTS_PER_PROTOCOL = 25;

const CA_CERT = fs.readFileSync(path.resolve("creds/__self__/CA.pem"), "utf8");

const CA_KEY = fs.readFileSync(path.resolve("creds/__self__/key.pem"), "utf8");

const UPSTREAM_CERT = fs.readFileSync(
  path.resolve("test/fixtures/certs/upstream-cert.pem"),
);

const UPSTREAM_KEY = fs.readFileSync(
  path.resolve("test/fixtures/certs/upstream-key.pem"),
);

type ProtocolResult = {
  successful: number;
  failed: number;
};

async function main(): Promise<void> {
  console.log("\n[MIXED LOAD] Starting upstream servers...");

  const httpUpstream = http.createServer((req, res) => {
    const body = `http-ok:${req.url}`;

    res.writeHead(200, {
      "content-type": "text/plain",
      "content-length": Buffer.byteLength(body),
      connection: "close",
    });

    res.end(body);
  });

  const httpsUpstream = https.createServer(
    {
      cert: UPSTREAM_CERT,
      key: UPSTREAM_KEY,
    },
    (req, res) => {
      const body = `https-ok:${req.url}`;

      res.writeHead(200, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(body),
        connection: "close",
      });

      res.end(body);
    },
  );

  const wsUpstream = http.createServer();

  const wsServer = new WebSocketServer({
    server: wsUpstream,
  });

  wsServer.on("connection", (socket) => {
    socket.on("message", (message) => {
      socket.send(`ws-echo:${message.toString()}`);
    });
  });

  const wssUpstream = https.createServer({
    cert: UPSTREAM_CERT,
    key: UPSTREAM_KEY,
  });

  const wssServer = new WebSocketServer({
    server: wssUpstream,
  });

  wssServer.on("connection", (socket) => {
    socket.on("message", (message) => {
      socket.send(`wss-echo:${message.toString()}`);
    });
  });

  await Promise.all([
    listen(httpUpstream),
    listen(httpsUpstream),
    listen(wsUpstream),
    listen(wssUpstream),
  ]);

  const httpPort = getPort(httpUpstream);
  const httpsPort = getPort(httpsUpstream);
  const wsPort = getPort(wsUpstream);
  const wssPort = getPort(wssUpstream);

  console.table({
    HTTP: httpPort,
    HTTPS: httpsPort,
    WS: wsPort,
    WSS: wssPort,
  });

  const proxy = new Proxy({
    rootCa: {
      cert: CA_CERT,
      key: CA_KEY,
    },
    useDefaultPipelines: true,
    useCertificateCache: false,
    useResponseCache: false,
  });

  try {
    await new Promise<void>((resolve) => {
      proxy.listen(0, resolve);
    });

    const proxyPort = (proxy.address() as net.AddressInfo).port;

    console.log(`[MIXED LOAD] Proxy: ${proxyPort}`);

    console.log(
      `\n[MIXED LOAD] Running ${CLIENTS_PER_PROTOCOL} clients per protocol`,
    );

    const startedAt = Date.now();

    const [httpResult, httpsResult, wsResult, wssResult] = await Promise.all([
      runProtocol("HTTP", CLIENTS_PER_PROTOCOL, () =>
        makeHttpRequest(proxyPort, httpPort),
      ),

      runProtocol("HTTPS", CLIENTS_PER_PROTOCOL, () =>
        makeHttpsRequest(proxyPort, httpsPort),
      ),

      runProtocol("WS", CLIENTS_PER_PROTOCOL, () =>
        makeWebSocketRequest(proxyPort, wsPort, false),
      ),

      runProtocol("WSS", CLIENTS_PER_PROTOCOL, () =>
        makeWebSocketRequest(proxyPort, wssPort, true),
      ),
    ]);

    const duration = Date.now() - startedAt;

    console.log("\n[MIXED LOAD] Results:");

    console.table({
      HTTP: httpResult,
      HTTPS: httpsResult,
      WS: wsResult,
      WSS: wssResult,
      DurationMs: duration,
    });

    const totalSuccessful =
      httpResult.successful +
      httpsResult.successful +
      wsResult.successful +
      wssResult.successful;

    const totalFailed =
      httpResult.failed +
      httpsResult.failed +
      wsResult.failed +
      wssResult.failed;

    console.table({
      "Total Requests": CLIENTS_PER_PROTOCOL * 4,
      Successful: totalSuccessful,
      Failed: totalFailed,
      "Success Rate (%)": (
        (totalSuccessful / (CLIENTS_PER_PROTOCOL * 4)) *
        100
      ).toFixed(2),
      "Throughput (ops/sec)": (
        totalSuccessful / Math.max(duration / 1000, 0.001)
      ).toFixed(2),
    });

    assert.equal(totalFailed, 0, "Mixed protocol workload had failures");

    assert.equal(
      totalSuccessful,
      CLIENTS_PER_PROTOCOL * 4,
      "Not all mixed protocol clients succeeded",
    );

    await waitForLifecycleDrain();

    console.log(
      "[DEBUG] Active request contexts:",
      ContextManager.getActiveRequests().map((request) => ({
        requestId: request.requestId,
        method: request.client.method,
        url: request.client.url,
        targetUrl: request.target.url,
        host: request.target.host,
        protocol: request.target.url?.split("://")[0],
      })),
    );

    assert.equal(
      ContextManager.getActiveRequests().length,
      0,
      "Request contexts leaked after mixed workload",
    );

    assert.equal(
      connectionManager.getCount(),
      0,
      "TCP connections leaked after mixed workload",
    );

    console.log("\n[MIXED LOAD] Lifecycle clean after workload");

    console.log("[MIXED LOAD] Stopping proxy...");
    await proxy.stop();

    await waitForLifecycleDrain();

    assert.equal(
      ContextManager.getActiveRequests().length,
      0,
      "Request contexts leaked after shutdown",
    );

    assert.equal(
      connectionManager.getCount(),
      0,
      "TCP connections leaked after shutdown",
    );

    console.log("\n[MIXED LOAD] All assertions passed");
  } finally {
    wsServer.close();
    wssServer.close();

    await Promise.all([
      closeServer(httpUpstream),
      closeServer(httpsUpstream),
      closeServer(wsUpstream),
      closeServer(wssUpstream),
    ]);
  }
}

async function runProtocol(
  name: string,
  count: number,
  task: () => Promise<void>,
): Promise<ProtocolResult> {
  let successful = 0;
  let failed = 0;

  await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      try {
        await task();
        successful++;
      } catch (error) {
        failed++;

        console.error(
          `[${name} ${index}] failed:`,
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );

  return {
    successful,
    failed,
  };
}

async function makeHttpRequest(
  proxyPort: number,
  upstreamPort: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "GET",
      path: `http://127.0.0.1:${upstreamPort}/mixed-http`,
      headers: {
        Host: `127.0.0.1:${upstreamPort}`,
        Connection: "close",
      },
    });

    req.once("response", (res) => {
      let body = "";

      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.once("end", () => {
        try {
          assert.equal(res.statusCode, 200);
          assert.equal(body, "http-ok:/mixed-http");
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

    req.once("error", reject);

    req.end();
  });
}

async function makeHttpsRequest(
  proxyPort: number,
  upstreamPort: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect(proxyPort, "127.0.0.1");

    let connectResponse = "";
    let tlsStarted = false;

    socket.once("connect", () => {
      socket.write(
        [
          `CONNECT localhost:${upstreamPort} HTTP/1.1`,
          `Host: localhost:${upstreamPort}`,
          "Connection: close",
          "",
          "",
        ].join("\r\n"),
      );
    });

    socket.on("data", (chunk) => {
      if (tlsStarted) return;

      connectResponse += chunk.toString();

      if (!connectResponse.includes("\r\n\r\n")) {
        return;
      }

      tlsStarted = true;

      try {
        assert.match(connectResponse, /^HTTP\/1\.1 200/);
      } catch (error) {
        socket.destroy();
        reject(error);
        return;
      }

      const tlsSocket = tls.connect({
        socket,
        servername: "localhost",
        rejectUnauthorized: true,
        ca: CA_CERT,
      });

      let responseData = "";

      tlsSocket.once("secureConnect", () => {
        tlsSocket.write(
          [
            "GET /mixed-https HTTP/1.1",
            "Host: localhost",
            "Connection: close",
            "",
            "",
          ].join("\r\n"),
        );
      });

      tlsSocket.on("data", (data) => {
        responseData += data.toString();
      });

      tlsSocket.once("end", () => {
        try {
          const [headers, body = ""] = responseData.split("\r\n\r\n", 2);

          assert.match(headers, /^HTTP\/1\.1 200/m);
          assert.equal(body, "https-ok:/mixed-https");

          resolve();
        } catch (error) {
          reject(error);
        }
      });

      tlsSocket.once("error", reject);
    });

    socket.once("error", reject);
  });
}

async function makeWebSocketRequest(
  proxyPort: number,
  upstreamPort: number,
  secure: boolean,
): Promise<void> {
  const protocol = secure ? "wss" : "ws";
  const target = `${protocol}://localhost:${upstreamPort}/mixed-ws`;

  const agent = secure
    ? new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`, {
        rejectUnauthorized: false,
      } as any)
    : new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`);

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(target, {
      agent,
      rejectUnauthorized: false,
    });

    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    ws.once("open", () => {
      ws.send("hello");
    });

    ws.once("message", (data) => {
      try {
        assert.equal(data.toString(), `${secure ? "wss" : "ws"}-echo:hello`);

        ws.close();
      } catch (error) {
        fail(error);
      }
    });

    ws.once("close", () => {
      if (settled) return;

      settled = true;
      resolve();
    });

    ws.once("error", fail);
  });
}

function listen(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close(() => resolve());
  });
}

function getPort(server: net.Server): number {
  return (server.address() as net.AddressInfo).port;
}

async function waitForLifecycleDrain(): Promise<void> {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const requests = ContextManager.getActiveRequests().length;
    const connections = connectionManager.getCount();

    if (requests === 0 && connections === 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  console.table({
    "Active Requests": ContextManager.getActiveRequests().length,
    "Active Connections": connectionManager.getCount(),
  });
}

main().catch((error) => {
  console.error("\n[MIXED LOAD] Fatal error:");
  console.error(error);
  process.exitCode = 1;
});
