import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import https from "node:https";
import WebSocket, { WebSocketServer } from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";

import { Proxy } from "../../src/lib/Proxy";
import { ContextManager } from "../../src/core/scope/ContextManager";
import { connectionManager } from "../../src/core/connection/ConnectionManager";

const CLIENTS = 50;

const CA_CERT = fs.readFileSync(
  path.resolve(process.cwd(), "creds/__self__/CA.pem"),"utf-8"
);

const CA_KEY = fs.readFileSync(
  path.resolve(process.cwd(), "creds/__self__/key.pem"), "utf-8",
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
  console.log("[WS UPSTREAM ABORT LOAD] Starting upstream server...");

  // const upstream = http.createServer();

  const upstream = https.createServer({
    cert: fs.readFileSync(
      path.resolve(process.cwd(), "test/fixtures/certs/upstream-cert.pem"),
    ),
    key: fs.readFileSync(
      path.resolve(process.cwd(), "test/fixtures/certs/upstream-key.pem"),
    ),
  });

  const wss = new WebSocketServer({
    server: upstream,
  });

  let upstreamConnections = 0;
  let upstreamTerminated = 0;

  wss.on("connection", (ws) => {
    upstreamConnections++;

    let messagesSent = 0;

    const interval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(interval);
        return;
      }

      ws.send(`message-${messagesSent}`);
      messagesSent++;

      if (messagesSent === 50) {
        clearInterval(interval);

        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            upstreamTerminated++;
            ws.terminate();
          }
        }, 25);
      }
    }, 5);

    ws.once("close", () => {
      clearInterval(interval);
    });
  });

  const upstreamPort = await listen(upstream);

  console.log(`[WS UPSTREAM ABORT LOAD] Upstream WS: ${upstreamPort}`);

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

  console.log(`[WS UPSTREAM ABORT LOAD] Proxy: ${proxyPort}`);

  console.log(`[WS UPSTREAM ABORT LOAD] Running ${CLIENTS} WS clients`);

  const agent = new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`);
  let upgraded = 0;
  let messagesReceived = 0;
  let clientClosed = 0;
  let clientErrors = 0;

  const startedAt = Date.now();

  const clients = Array.from(
    { length: CLIENTS },
    (_, index) =>
      new Promise<void>((resolve) => {
        const ws = new WebSocket(
          `wss://localhost:${upstreamPort}/wss-upstream-abort-${index}`,
          {
            agent,
            rejectUnauthorized: false,
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
        });

        ws.on("message", () => {
          messagesReceived++;
        });

        ws.once("close", () => {
          clientClosed++;
          finish();
        });

        ws.once("error", () => {
          clientErrors++;
          finish();
        });

        setTimeout(() => {
          if (!settled) {
            clientErrors++;

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
    MessagesReceived: messagesReceived,
    "Upstream Connections": upstreamConnections,
    "Upstream Terminated": upstreamTerminated,
    "Client Closed": clientClosed,
    "Client Errors": clientErrors,
    DurationMs: durationMs,
    "Throughput (ops/sec)": (CLIENTS / (durationMs / 1000)).toFixed(2),
  });

  await waitForLifecycleDrain();

  const activeRequests = ContextManager.getActiveRequests();
  const activeConnections = connectionManager.getCount();

  console.log(`[DEBUG] Active request contexts: ${activeRequests.length}`);

  assert.equal(
    upstreamConnections,
    CLIENTS,
    "Not all WS connections reached the upstream",
  );

  assert.equal(
    upstreamTerminated,
    CLIENTS,
    "Not all upstream WS connections were terminated",
  );

  assert.equal(
    activeRequests.length,
    0,
    "WS request contexts leaked after upstream abort workload",
  );

  assert.equal(
    activeConnections,
    0,
    "WS connections leaked after upstream abort workload",
  );

  console.log("[WS UPSTREAM ABORT LOAD] Lifecycle clean after workload");

  console.log("[WS UPSTREAM ABORT LOAD] Stopping proxy...");

  await proxy.stop();

  await closeServer(upstream);

  assert.equal(
    ContextManager.getActiveRequests().length,
    0,
    "Request contexts remain after proxy shutdown",
  );

  assert.ok(
    messagesReceived > 0,
    "No WS messages were received before upstream termination",
  );

  assert.equal(
    connectionManager.getCount(),
    0,
    "Connections remain after proxy shutdown",
  );

  console.log("[WS UPSTREAM ABORT LOAD] All assertions passed");
}

main().catch((err) => {
  console.error("\n[WS UPSTREAM ABORT LOAD] FAILED\n");
  console.error(err);

  process.exitCode = 1;
});
