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
const SOAK_RUNS = 10;
const WS_MESSAGES = 25;
const WS_MESSAGE_INTERVAL_MS = 5;
const UPSTREAM_DELAY_MS = 100;
const LIFECYCLE_DRAIN_TIMEOUT_MS = 5000;

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
  expectedFailures: number;
  unexpectedFailures: number;
};

type MemorySnapshot = {
  Run: number;
  RSS_MB: string;
  HeapUsed_MB: string;
  HeapTotal_MB: string;
  External_MB: string;
  ArrayBuffers_MB: string;
  ActiveHandles: number;
  ActiveRequests: number;
  ActiveConnections: number;
};

function getMemorySnapshot(run: number): MemorySnapshot {
  const memory = process.memoryUsage();

  return {
    Run: run,
    RSS_MB: (memory.rss / 1024 / 1024).toFixed(2),
    HeapUsed_MB: (memory.heapUsed / 1024 / 1024).toFixed(2),
    HeapTotal_MB: (memory.heapTotal / 1024 / 1024).toFixed(2),
    External_MB: (memory.external / 1024 / 1024).toFixed(2),
    ArrayBuffers_MB: (memory.arrayBuffers / 1024 / 1024).toFixed(2),
    ActiveHandles:
      typeof process.getActiveResourcesInfo === "function"
        ? process.getActiveResourcesInfo().length
        : -1,
    ActiveRequests: ContextManager.getActiveRequests().length,
    ActiveConnections: connectionManager.getCount(),
  };
}

function printMemorySummary(snapshots: MemorySnapshot[]): void {
  if (snapshots.length === 0) return;

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  console.log("\n[MIXED CHAOS SOAK] Memory summary:");
  console.table({
    "First Heap Used (MB)": first.HeapUsed_MB,
    "Last Heap Used (MB)": last.HeapUsed_MB,
    "Heap Delta (MB)": (
      Number(last.HeapUsed_MB) - Number(first.HeapUsed_MB)
    ).toFixed(2),
    "First RSS (MB)": first.RSS_MB,
    "Last RSS (MB)": last.RSS_MB,
    "RSS Delta (MB)": (Number(last.RSS_MB) - Number(first.RSS_MB)).toFixed(2),
    "First Handles": first.ActiveHandles,
    "Last Handles": last.ActiveHandles,
    "First External (MB)": first.External_MB,
    "Last External (MB)": last.External_MB,
  });
}

async function main(): Promise<void> {
  console.log("\n[MIXED CHAOS SOAK] Starting upstream servers...");

  const httpUpstream = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const mode = url.searchParams.get("mode") ?? "normal";

    if (mode === "drop") {
      req.socket.destroy();
      return;
    }

    const finish = () => {
      const body = `http-ok:${url.pathname}`;
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(200, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(body),
        connection: "close",
      });
      res.end(body);
    };

    if (mode === "slow") {
      setTimeout(finish, UPSTREAM_DELAY_MS);
      return;
    }

    finish();
  });

  const httpsUpstream = https.createServer(
    { cert: UPSTREAM_CERT, key: UPSTREAM_KEY },
    (req, res) => {
      const url = new URL(req.url ?? "/", "https://localhost");
      const mode = url.searchParams.get("mode") ?? "normal";

      if (mode === "drop") {
        req.socket.destroy();
        return;
      }

      const finish = () => {
        const body = `https-ok:${url.pathname}`;
        if (res.destroyed || res.writableEnded) return;
        res.writeHead(200, {
          "content-type": "text/plain",
          "content-length": Buffer.byteLength(body),
          connection: "close",
        });
        res.end(body);
      };

      if (mode === "slow") {
        setTimeout(finish, UPSTREAM_DELAY_MS);
        return;
      }

      finish();
    },
  );

  const wsUpstream = http.createServer();
  const wsServer = new WebSocketServer({ server: wsUpstream });

  wsServer.on("connection", (socket, req) => {
    const url = new URL(req.url ?? "/", "ws://localhost");
    const mode = url.searchParams.get("mode") ?? "normal";

    if (mode === "upstream-abort") {
      let sent = 0;
      const timer = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          clearInterval(timer);
          return;
        }
        sent++;
        socket.send(`ws-chaos:${sent}`);
        if (sent >= WS_MESSAGES) {
          clearInterval(timer);
          setTimeout(() => socket.terminate(), 25);
        }
      }, WS_MESSAGE_INTERVAL_MS);

      socket.once("close", () => clearInterval(timer));
      return;
    }

    socket.on("message", (message) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(`ws-echo:${message.toString()}`);
      }
    });
  });

  const wssUpstream = https.createServer({
    cert: UPSTREAM_CERT,
    key: UPSTREAM_KEY,
  });
  const wssServer = new WebSocketServer({ server: wssUpstream });

  wssServer.on("connection", (socket, req) => {
    const url = new URL(req.url ?? "/", "wss://localhost");
    const mode = url.searchParams.get("mode") ?? "normal";

    if (mode === "upstream-abort") {
      let sent = 0;
      const timer = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          clearInterval(timer);
          return;
        }
        sent++;
        socket.send(`wss-chaos:${sent}`);
        if (sent >= WS_MESSAGES) {
          clearInterval(timer);
          setTimeout(() => socket.terminate(), 25);
        }
      }, WS_MESSAGE_INTERVAL_MS);

      socket.once("close", () => clearInterval(timer));
      return;
    }

    socket.on("message", (message) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(`wss-echo:${message.toString()}`);
      }
    });
  });

  const proxy = new Proxy({
    rootCa: { cert: CA_CERT, key: CA_KEY },
    useDefaultPipelines: true,
    useCertificateCache: false,
    useResponseCache: false,
  });

  try {
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

    await new Promise<void>((resolve) => proxy.listen(0, resolve));
    const proxyPort = (proxy.address() as net.AddressInfo).port;

    console.log(`\n[MIXED CHAOS SOAK] Proxy: ${proxyPort}`);
    console.log(
      `[MIXED CHAOS SOAK] ${SOAK_RUNS} runs × ${CLIENTS_PER_PROTOCOL * 4} clients`,
    );

    const startedAt = Date.now();
    const snapshots: MemorySnapshot[] = [];
    let totalSuccessful = 0;
    let totalExpectedFailures = 0;
    let totalUnexpectedFailures = 0;

    for (let run = 1; run <= SOAK_RUNS; run++) {
      const runStartedAt = Date.now();
      console.log(`\n[MIXED CHAOS SOAK] Run ${run}/${SOAK_RUNS}`);

      const result = await runMixedChaosWorkload(
        proxyPort,
        httpPort,
        httpsPort,
        wsPort,
        wssPort,
      );

      totalSuccessful += result.successful;
      totalExpectedFailures += result.expectedFailures;
      totalUnexpectedFailures += result.unexpectedFailures;

      console.table({
        Run: run,
        Successful: result.successful,
        "Expected Failures": result.expectedFailures,
        "Unexpected Failures": result.unexpectedFailures,
        "Duration (ms)": Date.now() - runStartedAt,
      });

      assert.equal(
        result.unexpectedFailures,
        0,
        `Run ${run} had unexpected failures`,
      );
      assert.equal(
        result.successful + result.expectedFailures,
        CLIENTS_PER_PROTOCOL * 4,
        `Run ${run} did not produce an expected outcome for every client`,
      );

      await waitForLifecycleDrain();

      assert.equal(
        ContextManager.getActiveRequests().length,
        0,
        `Run ${run} leaked request contexts`,
      );
      assert.equal(
        connectionManager.getCount(),
        0,
        `Run ${run} leaked TCP connections`,
      );

      if (global.gc) global.gc();
      await new Promise((resolve) => setTimeout(resolve, 25));

      const snapshot = getMemorySnapshot(run);
      snapshots.push(snapshot);
      console.table(snapshot);
    }

    const totalClients = SOAK_RUNS * CLIENTS_PER_PROTOCOL * 4;
    const duration = Date.now() - startedAt;

    console.log("\n[MIXED CHAOS SOAK] Aggregate results:");
    console.table({
      Runs: SOAK_RUNS,
      "Clients / Run": CLIENTS_PER_PROTOCOL * 4,
      "Total Clients": totalClients,
      Successful: totalSuccessful,
      "Expected Failures": totalExpectedFailures,
      "Unexpected Failures": totalUnexpectedFailures,
      "Outcome Count":
        totalSuccessful + totalExpectedFailures + totalUnexpectedFailures,
      "Duration (ms)": duration,
      "Throughput (outcomes/sec)": (
        totalClients / Math.max(duration / 1000, 0.001)
      ).toFixed(2),
    });

    assert.equal(
      totalUnexpectedFailures,
      0,
      "Mixed protocol chaos soak had unexpected failures",
    );
    assert.equal(
      totalSuccessful + totalExpectedFailures,
      totalClients,
      "Not all soak clients reached an expected outcome",
    );

    await waitForLifecycleDrain();
    assert.equal(
      ContextManager.getActiveRequests().length,
      0,
      "Request contexts leaked after soak",
    );
    assert.equal(
      connectionManager.getCount(),
      0,
      "TCP connections leaked after soak",
    );

    printMemorySummary(snapshots);

    console.log("\n[MIXED CHAOS SOAK] Stopping proxy...");
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

    console.log("\n[MIXED CHAOS SOAK] All assertions passed");
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

async function runMixedChaosWorkload(
  proxyPort: number,
  httpPort: number,
  httpsPort: number,
  wsPort: number,
  wssPort: number,
): Promise<ProtocolResult> {
  const [httpResult, httpsResult, wsResult, wssResult] = await Promise.all([
    runProtocol("HTTP", CLIENTS_PER_PROTOCOL, (index) =>
      makeHttpChaosRequest(proxyPort, httpPort, index),
    ),
    runProtocol("HTTPS", CLIENTS_PER_PROTOCOL, (index) =>
      makeHttpsChaosRequest(proxyPort, httpsPort, index),
    ),
    runProtocol("WS", CLIENTS_PER_PROTOCOL, (index) =>
      makeWebSocketChaosRequest(proxyPort, wsPort, index, false),
    ),
    runProtocol("WSS", CLIENTS_PER_PROTOCOL, (index) =>
      makeWebSocketChaosRequest(proxyPort, wssPort, index, true),
    ),
  ]);

  return {
    successful:
      httpResult.successful +
      httpsResult.successful +
      wsResult.successful +
      wssResult.successful,
    expectedFailures:
      httpResult.expectedFailures +
      httpsResult.expectedFailures +
      wsResult.expectedFailures +
      wssResult.expectedFailures,
    unexpectedFailures:
      httpResult.unexpectedFailures +
      httpsResult.unexpectedFailures +
      wsResult.unexpectedFailures +
      wssResult.unexpectedFailures,
  };
}

async function runProtocol(
  name: string,
  count: number,
  task: (index: number) => Promise<"success" | "expected-failure">,
): Promise<ProtocolResult> {
  let successful = 0;
  let expectedFailures = 0;
  let unexpectedFailures = 0;

  await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      try {
        const outcome = await task(index);

        if (outcome === "success") {
          successful++;
        } else {
          expectedFailures++;
        }
      } catch (error) {
        unexpectedFailures++;

        console.error(
          `[${name} ${index}] unexpected failure:`,
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );

  return {
    successful,
    expectedFailures,
    unexpectedFailures,
  };
}

async function makeHttpChaosRequest(
  proxyPort: number,
  upstreamPort: number,
  index: number,
): Promise<"success" | "expected-failure"> {
  const mode = chaosMode(index);
  const expectedFailure = mode === "drop";
  const pathName = `/chaos-http?mode=${mode}`;

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "GET",
      path: `http://127.0.0.1:${upstreamPort}${pathName}`,
      headers: {
        Host: `127.0.0.1:${upstreamPort}`,
        Connection: "close",
      },
    });

    let settled = false;

    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve("success");
    };

    const expected = () => {
      if (settled) return;
      settled = true;
      resolve("expected-failure");
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.once("response", (res) => {
      let body = "";

      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });

      res.once("end", () => {
        try {
          if (expectedFailure) {
            assert.equal(
              res.statusCode,
              502,
              `HTTP drop produced unexpected status: ${res.statusCode}`,
            );
            expected();
            return;
          }

          assert.equal(res.statusCode, 200);
          assert.equal(body, `http-ok:/chaos-http`);
          succeed();
        } catch (error) {
          fail(error);
        }
      });
    });

    req.once("error", (error) => {
      if (expectedFailure) {
        expected();
        return;
      }

      fail(error);
    });

    req.end();
  });
}

async function makeHttpsChaosRequest(
  proxyPort: number,
  upstreamPort: number,
  index: number,
): Promise<"success" | "expected-failure"> {
  const mode = chaosMode(index);
  const expectedFailure = mode === "drop";

  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, "127.0.0.1");

    let connectResponse = "";
    let tlsStarted = false;
    let settled = false;

    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve("success");
    };

    const expected = () => {
      if (settled) return;
      settled = true;
      resolve("expected-failure");
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

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

      if (!connectResponse.includes("\r\n\r\n")) return;

      tlsStarted = true;

      try {
        assert.match(connectResponse, /^HTTP\/1\.1 200/);
      } catch (error) {
        socket.destroy();
        fail(error);
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
            `GET /chaos-https?mode=${mode} HTTP/1.1`,
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
        if (settled) return;

        try {
          if (expectedFailure) {
            expected();
            return;
          }

          const [headers, body = ""] = responseData.split("\r\n\r\n", 2);

          assert.match(headers, /^HTTP\/1\.1 200/m);
          assert.equal(body, "https-ok:/chaos-https");
          succeed();
        } catch (error) {
          fail(error);
        }
      });

      tlsSocket.once("error", (error) => {
        if (expectedFailure) {
          expected();
          return;
        }

        fail(error);
      });
    });

    socket.once("error", (error) => {
      if (expectedFailure) {
        expected();
        return;
      }

      fail(error);
    });

    socket.once("close", () => {
      if (settled) return;

      if (expectedFailure) {
        expected();
        return;
      }

      fail(new Error("HTTPS client socket closed before completion"));
    });
  });
}

async function makeWebSocketChaosRequest(
  proxyPort: number,
  upstreamPort: number,
  index: number,
  secure: boolean,
): Promise<"success" | "expected-failure"> {
  const mode = wsChaosMode(index);
  const protocol = secure ? "wss" : "ws";
  const target = `${protocol}://localhost:${upstreamPort}/chaos-ws?mode=${mode}`;

  const agent = secure
    ? new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`, {
        rejectUnauthorized: false,
      } as any)
    : new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target, {
      agent,
      rejectUnauthorized: false,
    });

    let settled = false;
    let received = 0;

    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve("success");
    };

    const expected = () => {
      if (settled) return;
      settled = true;
      resolve("expected-failure");
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    ws.once("open", () => {
      if (mode === "client-abort") {
        ws.terminate();
        return;
      }

      if (mode === "upstream-abort") return;

      ws.send("hello");
    });

    ws.on("message", (data) => {
      received++;

      try {
        if (mode === "upstream-abort") {
          assert.equal(
            data.toString(),
            `${secure ? "wss" : "ws"}-chaos:${received}`,
          );

          if (received >= WS_MESSAGES) {
            // The upstream will terminate shortly after its final message.
            return;
          }

          return;
        }

        assert.equal(data.toString(), `${secure ? "wss" : "ws"}-echo:hello`);

        ws.close();
      } catch (error) {
        fail(error);
      }
    });

    ws.once("close", () => {
      if (settled) return;

      if (mode === "client-abort" || mode === "upstream-abort") {
        expected();
        return;
      }

      if (mode === "normal") {
        succeed();
        return;
      }

      fail(new Error(`Unexpected WebSocket close in mode: ${mode}`));
    });

    ws.once("error", (error) => {
      if (mode === "client-abort" || mode === "upstream-abort") {
        expected();
        return;
      }

      fail(error);
    });
  });
}

function chaosMode(index: number): "normal" | "slow" | "drop" {
  const remainder = index % 3;

  if (remainder === 0) return "normal";
  if (remainder === 1) return "slow";
  return "drop";
}

function wsChaosMode(
  index: number,
): "normal" | "client-abort" | "upstream-abort" {
  const remainder = index % 3;

  if (remainder === 0) return "normal";
  if (remainder === 1) return "client-abort";
  return "upstream-abort";
}

function listen(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function getPort(server: net.Server): number {
  return (server.address() as net.AddressInfo).port;
}

async function waitForLifecycleDrain(): Promise<void> {
  const deadline = Date.now() + LIFECYCLE_DRAIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const requests = ContextManager.getActiveRequests().length;
    const connections = connectionManager.getCount();

    if (requests === 0 && connections === 0) return;

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const requests = ContextManager.getActiveRequests().length;
  const connections = connectionManager.getCount();

  console.table({
    "Active Requests": requests,
    "Active Connections": connections,
  });

  throw new Error(
    `Lifecycle did not drain within ${LIFECYCLE_DRAIN_TIMEOUT_MS}ms: requests=${requests}, connections=${connections}`,
  );
}

main().catch((error) => {
  console.error("\n[MIXED CHAOS] Fatal error:");
  console.error(error);
  process.exitCode = 1;
});
