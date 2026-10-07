import http from "node:http";
import assert from "node:assert/strict";

import { Proxy } from "../../src/lib/Proxy";
import { ContextManager } from "../../src/core/scope/ContextManager";
import { connectionManager } from "../../src/core/connection/ConnectionManager";

const UPSTREAM_HOST = "127.0.0.1";

const CONNECTIONS = 500;
const SHUTDOWN_AFTER_MS = 500;
const UPSTREAM_RESPONSE_DELAY_MS = 10_000;

async function main(): Promise<void> {
  let upstreamRequests = 0;

  /*
   * Deliberately slow upstream.
   *
   * This ensures requests are still in flight when proxy.stop()
   * is called.
   */
  const upstream = http.createServer((req, res) => {
    upstreamRequests++;

    const timer = setTimeout(() => {
      if (res.destroyed || res.writableEnded) {
        return;
      }

      const body = "shutdown-test-ok";

      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Length": Buffer.byteLength(body),
        Connection: "keep-alive",
      });

      res.end(body);
    }, UPSTREAM_RESPONSE_DELAY_MS);

    res.once("close", () => {
      clearTimeout(timer);
    });
  });

  await new Promise<void>((resolve) => {
    upstream.listen(0, UPSTREAM_HOST, resolve);
  });

  const upstreamPort = (upstream.address() as import("node:net").AddressInfo)
    .port;

  const proxy = new Proxy({
    useDefaultPipelines: true,
    useCertificateCache: false,
    useResponseCache: false,

    upstreamTimeoutMs: 5_000,
  });

  await new Promise<void>((resolve) => {
    proxy.listen(0, resolve);
  });

  const proxyPort = (proxy.address() as import("node:net").AddressInfo).port;

  console.log(`[SHUTDOWN] Upstream :${upstreamPort} | Proxy :${proxyPort}`);

  console.log(
    `[SHUTDOWN] Starting ${CONNECTIONS} concurrent in-flight requests`,
  );

  let completed = 0;
  let failed = 0;

  const requests: Promise<void>[] = [];

  for (let i = 0; i < CONNECTIONS; i++) {
    requests.push(
      new Promise<void>((resolve) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port: proxyPort,
            method: "GET",

            path: `http://127.0.0.1:${upstreamPort}/`,

            headers: {
              Host: `127.0.0.1:${upstreamPort}`,
              Connection: "keep-alive",
            },
          },
          (res) => {
            res.resume();

            res.once("end", () => {
              completed++;
              resolve();
            });

            res.once("close", () => {
              resolve();
            });
          },
        );

        req.once("error", (err) => {
          // Log the first few errors to confirm the exact failure
          if (failed < 3) {
            console.log(`[CLIENT ERROR] ${err.message}`);
          }
          failed++;
          resolve();
        });

        req.end();
      }),
    );
  }

  /*
   * Give the requests time to reach the proxy and upstream.
   */
  await new Promise<void>((resolve) => {
    setTimeout(resolve, SHUTDOWN_AFTER_MS);
  });

  const activeRequestsBefore = ContextManager.getActiveRequests().length;

  const activeConnectionsBefore = connectionManager.getCount();

  console.log("\n[SHUTDOWN] Before shutdown:");
  console.log("  Active requests:", activeRequestsBefore);
  console.log("  Active connections:", activeConnectionsBefore);
  console.log("  Upstream requests:", upstreamRequests);

  /*
   * This is the important part:
   *
   * requests are still in flight here.
   */
  console.log("\n[SHUTDOWN] Calling proxy.stop() while load is active...");

  const shutdownStart = Date.now();

  await proxy.stop(4000);

  const shutdownDuration = Date.now() - shutdownStart;

  console.log(`[SHUTDOWN] Proxy stopped in ${shutdownDuration}ms`);

  /*
   * Allow all client-side request promises to settle.
   */
  await Promise.all(requests);

  await new Promise<void>((resolve) => {
    upstream.close(() => resolve());
  });

  const activeRequestsAfter = ContextManager.getActiveRequests().length;

  const activeConnectionsAfter = connectionManager.getCount();

  console.log("\n[SHUTDOWN] Results:");
  console.log("  Completed requests:", completed);
  console.log("  Failed requests:", failed);
  console.log("  Upstream requests:", upstreamRequests);
  console.log("  Active requests after shutdown:", activeRequestsAfter);
  console.log("  Active connections after shutdown:", activeConnectionsAfter);

  /*
   * The important assertions.
   */
  assert.equal(activeRequestsAfter, 0, "Active requests leaked after shutdown");

  assert.equal(
    activeConnectionsAfter,
    0,
    "Active connections leaked after shutdown",
  );

  console.log("\n[SHUTDOWN] Cleanup assertions passed");
  console.log("[SHUTDOWN] Complete");
}

main().catch((error) => {
  console.error("[SHUTDOWN] Fatal error:", error);
  process.exitCode = 1;
});
