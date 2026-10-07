import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import WebSocket, { WebSocketServer } from "ws";
import { HttpProxyAgent } from "http-proxy-agent";

import { Proxy } from "../../src/lib/Proxy";
import { ContextManager } from "../../src/core/scope/ContextManager";
import { connectionManager } from "../../src/core/connection/ConnectionManager";
 
const CLIENTS = 25;

const CA_CERT = fs.readFileSync(
  path.resolve(process.cwd(), "creds/__self__/CA.pem"),
);

const CA_KEY = fs.readFileSync(
  path.resolve(process.cwd(), "creds/__self__/key.pem"),
);

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve server address"));
        return;
      }

      resolve(address.port);
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function waitForLifecycleDrain(timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const activeRequests = ContextManager.getActiveRequests().length;
      const activeConnections = connectionManager.getCount();

      if (activeRequests === 0 && activeConnections === 0) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(
          new Error(
            `Lifecycle did not drain: requests=${activeRequests}, connections=${activeConnections}`,
          ),
        );
        return;
      }

      setTimeout(check, 25);
    };

    check();
  });
}

async function main(): Promise<void> {
  console.log("[WS ABORT LOAD] Starting upstream server...");

  const upstream = http.createServer();

  const wss = new WebSocketServer({
    server: upstream,
  });

  wss.on("connection", (ws) => {
    ws.on("message", (message) => {
      ws.send(message);
    });
  });

  const upstreamPort = await listen(upstream);

  console.log(`[WS ABORT LOAD] Upstream WS: ${upstreamPort}`);

  const proxy = new Proxy({
    rootCa: {
      cert: CA_CERT,
      key: CA_KEY,
    },
    useDefaultPipelines: true,
    useCertificateCache: false,
    useResponseCache: false,
  });

  await new Promise<void>((resolve) => {
    proxy.listen(0, () => resolve());
  });

  const proxyAddress = proxy.address();

  if (!proxyAddress || typeof proxyAddress === "string" || !proxyAddress.port) {
    throw new Error("Failed to resolve proxy port");
  }

  const proxyPort = proxyAddress.port;

  console.log(`[WS ABORT LOAD] Proxy: ${proxyPort}`);
  console.log(
    `[WS ABORT LOAD] Running ${CLIENTS} WS clients with immediate terminate()`,
  );

  const agent = new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`);

  let upgraded = 0;
  let terminated = 0;
  let failed = 0;

  const startedAt = Date.now();

  const clients = Array.from(
    { length: CLIENTS },
    (_, index) =>
      new Promise<void>((resolve) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${upstreamPort}/ws-abort-${index}`,
          {
            agent,
          },
        );

        let settled = false;

        const finish = () => {
          if (settled) return;

          settled = true;
          resolve();
        };

        ws.once("open", () => {
          upgraded++;

          // Abnormal client-side termination.
          ws.terminate();
        });

        ws.once("close", () => {
          terminated++;
          finish();
        });

        ws.once("error", () => {
          failed++;
          finish();
        });

        setTimeout(() => {
          if (!settled) {
            failed++;

            try {
              ws.terminate();
            } catch {
              // Ignore cleanup errors.
            }

            finish();
          }
        }, 5000);
      }),
  );

  await Promise.all(clients);

  const durationMs = Date.now() - startedAt;

  console.table({
    Clients: CLIENTS,
    Upgraded: upgraded,
    Terminated: terminated,
    Failed: failed,
    DurationMs: durationMs,
    "Throughput (ops/sec)": (CLIENTS / (durationMs / 1000)).toFixed(2),
  });

  /*
   * The important assertion is lifecycle cleanup.
   *
   * These clients intentionally terminate, so we don't require
   * application-level WebSocket success after the termination.
   */
  await waitForLifecycleDrain();

  const activeRequests = ContextManager.getActiveRequests();
  const activeConnections = connectionManager.getCount();

  console.log(`[DEBUG] Active request contexts: ${activeRequests.length}`);

  assert.equal(
    activeRequests.length,
    0,
    "WS request contexts leaked after client abort workload",
  );

  assert.equal(
    activeConnections,
    0,
    "WS connections leaked after client abort workload",
  );

  console.log("[WS ABORT LOAD] Lifecycle clean after workload");

  console.log("[WS ABORT LOAD] Stopping proxy...");

  await proxy.stop();

  await closeServer(upstream);

  assert.equal(
    ContextManager.getActiveRequests().length,
    0,
    "Request contexts remain after proxy shutdown",
  );

  assert.equal(
    connectionManager.getCount(),
    0,
    "Connections remain after proxy shutdown",
  );

  console.log("[WS ABORT LOAD] All assertions passed");
}

main().catch(async (err) => {
  console.error("\n[WS ABORT LOAD] FAILED\n");
  console.error(err);

  process.exitCode = 1;
});
