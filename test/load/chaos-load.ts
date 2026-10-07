 
import { monitorEventLoopDelay } from "node:perf_hooks";
import http from "node:http";
import assert from "node:assert/strict";

import autocannon from "autocannon";

import { Proxy } from "../../src/lib/Proxy";
import { ContextManager } from "../../src/core/scope/ContextManager";
import { connectionManager } from "../../src/core/connection/ConnectionManager";
 
const UPSTREAM_HOST = "127.0.0.1";

type FaultType = "tcp-drop" | "timeout" | "premature-close" | "normal";

type FaultCounts = Record<FaultType, number>;

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function chooseFault(random: () => number): FaultType {
  const roll = random();

  if (roll < 0.25) {
    return "tcp-drop";
  }

  if (roll < 0.5) {
    return "timeout";
  }

  if (roll < 0.75) {
    return "premature-close";
  }

  return "normal";
}

async function main(): Promise<void> {
  const seed = Number(process.env.CHAOS_SEED ?? Date.now());

  const random = createSeededRandom(seed);

  const faultCounts: FaultCounts = {
    "tcp-drop": 0,
    timeout: 0,
    "premature-close": 0,
    normal: 0,
  };

  const upstream = http.createServer((req, res) => {
    const fault = chooseFault(random);

    faultCounts[fault]++;

    switch (fault) {
      case "tcp-drop": {
        // Fault 1: abruptly terminate the upstream TCP connection.
        req.socket.destroy();
        return;
      }

      case "timeout": {
        // Fault 2: black hole.
        // Do nothing and allow the proxy's upstream timeout to fire.
        return;
      }

      case "premature-close": {
        // Fault 3: advertise a larger response than we actually send,
        // then terminate the upstream connection.
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
        }, 5);

        return;
      }

      case "normal": {
        const body = "autocannon-ok";

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

    // Keep this intentionally short so the chaos test finishes quickly.
    upstreamTimeoutMs: 500,
  });

  await new Promise<void>((resolve) => {
    proxy.listen(0, resolve);
  });

  const proxyPort = (proxy.address() as import("node:net").AddressInfo).port;

  console.log(`[CHAOS] Upstream on :${upstreamPort} | Proxy on :${proxyPort}`);

  console.log(`[CHAOS] Seed: ${seed}`);

  const eventLoopDelay = monitorEventLoopDelay({
    resolution: 10,
  });

  eventLoopDelay.enable();

  const instance = autocannon(
    {
      url: `http://127.0.0.1:${proxyPort}/`,

      connections: 100,
      duration: 15,
      pipelining: 1,

      setupClient(client) {
        client.setRequest({
          method: "GET",

          path: `http://127.0.0.1:${upstreamPort}/`,

          headers: {
            Host: `127.0.0.1:${upstreamPort}`,
            Connection: "keep-alive",
          },
        });
      },
    },

    (error, result) => {
      if (error) {
        console.error("[CHAOS] Autocannon failed:", error);
        process.exitCode = 1;
        return;
      }

      console.dir(result, {
        depth: null,
      });
    },
  );

  autocannon.track(instance, {
    renderProgressBar: true,
  });

  await new Promise<void>((resolve) => {
    instance.once("done", resolve);
  });

  eventLoopDelay.disable();

  console.log("\n[CHAOS] Fault distribution:");

  console.table(faultCounts);

  console.log("[CHAOS] Event loop delay (ms):", {
    mean: (eventLoopDelay.mean / 1e6).toFixed(2),
    p99: (eventLoopDelay.percentile(99) / 1e6).toFixed(2),
    max: (eventLoopDelay.max / 1e6).toFixed(2),
  });

  console.log(
    "[CHAOS] Active requests before shutdown:",
    ContextManager.getActiveRequests().length,
  );

  console.log(
    "[CHAOS] Active connections before shutdown:",
    connectionManager.getCount(),
  );

  console.log("\n[CHAOS] Stopping proxy...");

  await proxy.stop();

  await new Promise<void>((resolve) => {
    upstream.close(() => resolve());
  });

  console.log(
    "[CHAOS] Active requests after shutdown:",
    ContextManager.getActiveRequests().length,
  );

  console.log(
    "[CHAOS] Active connections after shutdown:",
    connectionManager.getCount(),
  );

  // Chaos is expected to produce request failures.
  // These assertions verify proxy cleanup rather than zero errors.
  assert.equal(
    ContextManager.getActiveRequests().length,
    0,
    "Active requests leaked after chaos test",
  );

  assert.equal(
    connectionManager.getCount(),
    0,
    "Active connections leaked after chaos test",
  );

  console.log("\n[CHAOS] Cleanup assertions passed");
  console.log("[CHAOS] Complete");
}

main().catch((error) => {
  console.error("[CHAOS] Fatal error:", error);
  process.exitCode = 1;
});
