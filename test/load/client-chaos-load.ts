import http from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";
import assert from "node:assert/strict";

import { Proxy } from "../../src/lib/Proxy";
import { connectionManager } from "../../src/core/connection/ConnectionManager";
import { ContextManager } from "../../src/core/scope/ContextManager";

const UPSTREAM_HOST = "127.0.0.1";

type UpstreamFault =
  "tcp-drop" | "timeout" | "premature-close" | "stream" | "normal";

type ClientBehavior =
  "normal" | "abort-before-response" | "abort-during-response";

type Counts = Record<UpstreamFault, number>;
type ClientCounts = Record<ClientBehavior, number>;

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function chooseUpstreamFault(random: () => number): UpstreamFault {
  const roll = random();

  if (roll < 0.2) return "tcp-drop";
  if (roll < 0.4) return "timeout";
  if (roll < 0.6) return "premature-close";
  if (roll < 0.8) return "stream";

  return "normal";
}

function chooseClientBehavior(random: () => number): ClientBehavior {
  const roll = random();

  if (roll < 0.25) return "abort-before-response";
  if (roll < 0.5) return "abort-during-response";

  return "normal";
}

function makeRequest(
  proxyPort: number,
  upstreamPort: number,
  behavior: ClientBehavior,
  random: () => number,
): Promise<void> {
  return new Promise((resolve) => {
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

        timeout: 2000,
      },
      (res) => {
        if (behavior === "abort-during-response") {
          // Give the proxy a chance to receive response data first.
          setTimeout(() => {
            req.destroy();
            res.destroy();
            resolve();
          }, 10);

          res.resume();
          return;
        }

        res.resume();

        res.once("end", resolve);
        res.once("close", resolve);
      },
    );

    req.once("error", () => {
      // Errors are expected during chaos.
      resolve();
    });

    req.once("timeout", () => {
      req.destroy();
      resolve();
    });

    if (behavior === "abort-before-response") {
      // Abort before the upstream has a chance to complete.
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 5);

      return;
    }

    req.end();

    // Prevent an individual request from hanging forever.
    const safetyTimeout = setTimeout(() => {
      if (!req.destroyed) {
        req.destroy();
      }

      resolve();
    }, 2500);

    safetyTimeout.unref();
  });
}

async function main(): Promise<void> {
  const seed = Number(process.env.CHAOS_SEED ?? Date.now());
  const random = createSeededRandom(seed);

  const upstreamCounts: Counts = {
    "tcp-drop": 0,
    timeout: 0,
    "premature-close": 0,
    stream: 0,
    normal: 0,
  };

  const clientCounts: ClientCounts = {
    normal: 0,
    "abort-before-response": 0,
    "abort-during-response": 0,
  };

  const upstream = http.createServer((req, res) => {
    const fault = chooseUpstreamFault(random);

    upstreamCounts[fault]++;

    switch (fault) {
      case "tcp-drop": {
        req.socket.destroy();
        return;
      }

      case "timeout": {
        // Intentionally do nothing.
        return;
      }

      case "premature-close": {
        const payload = "Start of the payload...";

        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Content-Length": "10000",
          Connection: "keep-alive",
        });

        res.write(payload);

        setTimeout(() => {
          if (!res.destroyed) {
            res.destroy();
          }
        }, 10);

        return;
      }

      case "stream": {
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Transfer-Encoding": "chunked",
          Connection: "keep-alive",
        });

        let chunks = 0;

        const interval = setInterval(() => {
          if (res.destroyed || res.writableEnded) {
            clearInterval(interval);
            return;
          }

          res.write(Buffer.alloc(16 * 1024, "x"));

          chunks++;

          if (chunks >= 100) {
            clearInterval(interval);
            res.end();
          }
        }, 5);

        return;
      }

      case "normal": {
        const body = "client-chaos-ok";

        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Content-Length": Buffer.byteLength(body),
          Connection: "keep-alive",
        });

        res.end(body);

        return;
      }
    }
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

    // Keep timeout short so the chaos run doesn't hang.
    upstreamTimeoutMs: 500,
  });

  await new Promise<void>((resolve) => {
    proxy.listen(0, resolve);
  });

  const proxyPort = (proxy.address() as import("node:net").AddressInfo).port;

  console.log(`[CLIENT CHAOS] Upstream :${upstreamPort} | Proxy :${proxyPort}`);

  console.log(`[CLIENT CHAOS] Seed: ${seed}`);

  const eventLoopDelay = monitorEventLoopDelay({
    resolution: 10,
  });

  eventLoopDelay.enable();

  const durationMs = 15_000;
  const concurrency = 100;

  const endAt = Date.now() + durationMs;

  async function worker(): Promise<void> {
    while (Date.now() < endAt) {
      const behavior = chooseClientBehavior(random);

      clientCounts[behavior]++;

      await makeRequest(proxyPort, upstreamPort, behavior, random);
    }
  }

  console.log(
    `[CLIENT CHAOS] Starting ${concurrency} concurrent clients for ${
      durationMs / 1000
    }s`,
  );

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  eventLoopDelay.disable();

  console.log("\n[CLIENT CHAOS] Upstream fault distribution:");

  console.table(upstreamCounts);

  console.log("[CLIENT CHAOS] Client behavior distribution:");

  console.table(clientCounts);

  console.log("[CLIENT CHAOS] Event loop delay (ms):", {
    mean: (eventLoopDelay.mean / 1e6).toFixed(2),
    p99: (eventLoopDelay.percentile(99) / 1e6).toFixed(2),
    max: (eventLoopDelay.max / 1e6).toFixed(2),
  });

  console.log(
    "\n[CLIENT CHAOS] Active requests before shutdown:",
    ContextManager.getActiveRequests().length,
  );

  console.log(
    "[CLIENT CHAOS] Active connections before shutdown:",
    connectionManager.getCount(),
  );

  console.log("\n[CLIENT CHAOS] Stopping proxy...");

  await proxy.stop();

  await new Promise<void>((resolve) => {
    upstream.close(() => resolve());
  });

  const activeRequests = ContextManager.getActiveRequests().length;
  const activeConnections = connectionManager.getCount();

  console.log("[CLIENT CHAOS] Active requests after shutdown:", activeRequests);

  console.log(
    "[CLIENT CHAOS] Active connections after shutdown:",
    activeConnections,
  );

  assert.equal(
    activeRequests,
    0,
    "Active requests leaked after client chaos test",
  );

  assert.equal(
    activeConnections,
    0,
    "Active connections leaked after client chaos test",
  );

  console.log("\n[CLIENT CHAOS] Cleanup assertions passed");
  console.log("[CLIENT CHAOS] Complete");
}

main().catch((error) => {
  console.error("[CLIENT CHAOS] Fatal error:", error);
  process.exitCode = 1;
});
