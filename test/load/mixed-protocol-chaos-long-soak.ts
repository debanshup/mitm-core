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

const CLIENTS_PER_PROTOCOL = 100;
const SOAK_RUNS = 100;
const WS_MESSAGES = 25;
const WS_MESSAGE_INTERVAL_MS = 5;
const UPSTREAM_DELAY_MS = 100;
const LIFECYCLE_DRAIN_TIMEOUT_MS = 5000;
const INTER_RUN_DELAY_MS = 250;
const WARMUP_RUNS = 10;

const PROTOCOL = (process.env.PROTOCOL ?? "mixed").toLowerCase();

const VALID_PROTOCOLS = ["mixed", "http", "https", "ws", "wss"] as const;

if (!VALID_PROTOCOLS.includes(PROTOCOL as (typeof VALID_PROTOCOLS)[number])) {
  throw new Error(
    `Invalid PROTOCOL="${PROTOCOL}". Expected one of: ${VALID_PROTOCOLS.join(", ")}`,
  );
}

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
  ActiveResources: number;
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
    ActiveResources:
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

  console.log("\n[MIXED CHAOS LONG SOAK] Memory summary:");
  console.table({
    "First Heap Used (MB)": first.HeapUsed_MB,
    "Last Heap Used (MB)": last.HeapUsed_MB,
    "Heap Delta (MB)": (
      Number(last.HeapUsed_MB) - Number(first.HeapUsed_MB)
    ).toFixed(2),
    "First RSS (MB)": first.RSS_MB,
    "Last RSS (MB)": last.RSS_MB,
    "RSS Delta (MB)": (Number(last.RSS_MB) - Number(first.RSS_MB)).toFixed(2),
    "First Active Resources": first.ActiveResources,
    "Last Active Resources": last.ActiveResources,
    "First External (MB)": first.External_MB,
    "Last External (MB)": last.External_MB,
  });
}

function getExpectedRunResult(): {
  successful: number;
  expectedFailures: number;
} {
  const httpFailures = Math.floor(CLIENTS_PER_PROTOCOL / 3);
  const httpSuccesses = CLIENTS_PER_PROTOCOL - httpFailures;

  // WS has two failure modes (client-abort, upstream-abort) per 3 requests
  const wsSuccesses = Math.ceil(CLIENTS_PER_PROTOCOL / 3);
  const wsFailures = CLIENTS_PER_PROTOCOL - wsSuccesses;

  switch (PROTOCOL) {
    case "http":
    case "https":
      return {
        successful: httpSuccesses,
        expectedFailures: httpFailures,
      };
    case "ws":
    case "wss":
      return {
        successful: wsSuccesses,
        expectedFailures: wsFailures,
      };
    case "mixed":
      return {
        successful: httpSuccesses * 2 + wsSuccesses * 2,
        expectedFailures: httpFailures * 2 + wsFailures * 2,
      };
    default:
      throw new Error(`Unsupported protocol: ${PROTOCOL}`);
  }
}

async function main(): Promise<void> {
  console.log("\n[MIXED CHAOS LONG SOAK] Starting upstream servers...");

  const clientsPerRun =
    PROTOCOL === "mixed" ? CLIENTS_PER_PROTOCOL * 4 : CLIENTS_PER_PROTOCOL;

  console.log(`[MIXED CHAOS LONG SOAK] Protocol: ${PROTOCOL}`);

  console.log(
    `[MIXED CHAOS LONG SOAK] ${SOAK_RUNS} runs × ${clientsPerRun} clients = ${
      SOAK_RUNS * clientsPerRun
    } total outcomes`,
  );

  console.log(
    `[MIXED CHAOS LONG SOAK] ${WARMUP_RUNS} warmup runs + ${Math.max(
      0,
      SOAK_RUNS - WARMUP_RUNS,
    )} measurement runs`,
  );

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
        // FIXED: Added missing closing brace for url.pathname
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

    console.log(`\n[MIXED CHAOS LONG SOAK] Proxy: ${proxyPort}`);
    console.log(`[MIXED CHAOS LONG SOAK] Protocol: ${PROTOCOL}`);

    console.log(
      `[MIXED CHAOS LONG SOAK] ${SOAK_RUNS} runs × ${clientsPerRun} clients`,
    );

    const startedAt = Date.now();
    const snapshots: MemorySnapshot[] = [];

    let totalSuccessful = 0;
    let totalExpectedFailures = 0;
    let totalUnexpectedFailures = 0;

    // Per-run deterministic expectation.
    const expectedRunResult = getExpectedRunResult();

    for (let run = 1; run <= SOAK_RUNS; run++) {
      const runStartedAt = Date.now();

      console.log(`\n[MIXED CHAOS LONG SOAK] Run ${run}/${SOAK_RUNS}`);

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
        clientsPerRun,
        `Run ${run} did not produce an expected outcome for every client`,
      );

      assert.equal(
        result.successful,
        expectedRunResult.successful,
        `Run ${run} success count changed for ${PROTOCOL}`,
      );

      assert.equal(
        result.expectedFailures,
        expectedRunResult.expectedFailures,
        `Run ${run} expected-failure count changed for ${PROTOCOL}`,
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

      // Capture memory before and after forced GC. The post-GC sample is the
      // primary leak signal; the pre-GC sample helps distinguish retained
      // objects from normal V8 garbage waiting for collection.
      const beforeGc = getMemorySnapshot(run);

      if (global.gc) {
        global.gc();
      }

      await new Promise((resolve) => setTimeout(resolve, 25));

      const afterGc = getMemorySnapshot(run);
      snapshots.push(afterGc);

      console.table({
        Run: run,
        "Heap Before GC (MB)": beforeGc.HeapUsed_MB,
        "Heap After GC (MB)": afterGc.HeapUsed_MB,
        "RSS (MB)": afterGc.RSS_MB,
        "External (MB)": afterGc.External_MB,
        "ArrayBuffers (MB)": afterGc.ArrayBuffers_MB,
        "Active Resources": afterGc.ActiveResources,
        "Active Requests": afterGc.ActiveRequests,
        "Active Connections": afterGc.ActiveConnections,
      });

      assert.equal(
        afterGc.ActiveRequests,
        0,
        `Run ${run} retained active requests after GC`,
      );

      assert.equal(
        afterGc.ActiveConnections,
        0,
        `Run ${run} retained active connections after GC`,
      );

      if (run < SOAK_RUNS) {
        await new Promise((resolve) => setTimeout(resolve, INTER_RUN_DELAY_MS));
      }
    }

    const totalClients = SOAK_RUNS * clientsPerRun;
    const duration = Date.now() - startedAt;

    console.log("\n[MIXED CHAOS LONG SOAK] Aggregate results:");

    console.table({
      Runs: SOAK_RUNS,
      "Clients / Run": clientsPerRun,
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
      "Mixed protocol chaos long soak had unexpected failures",
    );

    assert.equal(
      totalSuccessful + totalExpectedFailures,
      totalClients,
      "Not all long-soak clients reached an expected outcome",
    );

    // Aggregate expectation across the entire soak.
    const expectedSuccessful = SOAK_RUNS * expectedRunResult.successful;

    const expectedFailures = SOAK_RUNS * expectedRunResult.expectedFailures;

    assert.equal(
      totalSuccessful,
      expectedSuccessful,
      `Expected ${expectedSuccessful} successful outcomes`,
    );

    assert.equal(
      totalExpectedFailures,
      expectedFailures,
      `Expected ${expectedFailures} expected failures`,
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

    const measurementSnapshots = snapshots.filter(
      (snapshot) => snapshot.Run > WARMUP_RUNS,
    );

    if (measurementSnapshots.length > 0) {
      const firstMeasurement = measurementSnapshots[0];

      const lastMeasurement =
        measurementSnapshots[measurementSnapshots.length - 1];

      console.log("\n[MIXED CHAOS LONG SOAK] Measurement window:");

      console.table({
        "Warmup Runs": WARMUP_RUNS,
        "Measured Runs": measurementSnapshots.length,
        "First Measured Heap (MB)": firstMeasurement.HeapUsed_MB,
        "Last Measured Heap (MB)": lastMeasurement.HeapUsed_MB,
        "Measured Heap Delta (MB)": (
          Number(lastMeasurement.HeapUsed_MB) -
          Number(firstMeasurement.HeapUsed_MB)
        ).toFixed(2),
        "First Measured RSS (MB)": firstMeasurement.RSS_MB,
        "Last Measured RSS (MB)": lastMeasurement.RSS_MB,
        "Measured RSS Delta (MB)": (
          Number(lastMeasurement.RSS_MB) - Number(firstMeasurement.RSS_MB)
        ).toFixed(2),
        "First Measured External (MB)": firstMeasurement.External_MB,
        "Last Measured External (MB)": lastMeasurement.External_MB,
        "First Measured Active Resources": firstMeasurement.ActiveResources,
        "Last Measured Active Resources": lastMeasurement.ActiveResources,
      });
    }

    console.log("\n[MIXED CHAOS LONG SOAK] Stopping proxy...");

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

    console.log("\n[MIXED CHAOS LONG SOAK] All assertions passed");
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
  if (PROTOCOL === "http") {
    return runProtocol("HTTP", CLIENTS_PER_PROTOCOL, (index) =>
      makeHttpChaosRequest(proxyPort, httpPort, index),
    ).then((result) => ({
      successful: result.successful,
      expectedFailures: result.expectedFailures,
      unexpectedFailures: result.unexpectedFailures,
    }));
  }

  if (PROTOCOL === "https") {
    return runProtocol("HTTPS", CLIENTS_PER_PROTOCOL, (index) =>
      makeHttpsChaosRequest(proxyPort, httpsPort, index),
    ).then((result) => ({
      successful: result.successful,
      expectedFailures: result.expectedFailures,
      unexpectedFailures: result.unexpectedFailures,
    }));
  }

  if (PROTOCOL === "ws") {
    return runProtocol("WS", CLIENTS_PER_PROTOCOL, (index) =>
      makeWebSocketChaosRequest(proxyPort, wsPort, index, false),
    ).then((result) => ({
      successful: result.successful,
      expectedFailures: result.expectedFailures,
      unexpectedFailures: result.unexpectedFailures,
    }));
  }

  if (PROTOCOL === "wss") {
    return runProtocol("WSS", CLIENTS_PER_PROTOCOL, (index) =>
      makeWebSocketChaosRequest(proxyPort, wssPort, index, true),
    ).then((result) => ({
      successful: result.successful,
      expectedFailures: result.expectedFailures,
      unexpectedFailures: result.unexpectedFailures,
    }));
  }

  // Existing mixed-protocol behavior.
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
  console.error("\n[MIXED CHAOS LONG SOAK] Fatal error:");
  console.error(error);
  process.exitCode = 1;
});
