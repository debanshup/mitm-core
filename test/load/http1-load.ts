import { monitorEventLoopDelay } from "node:perf_hooks";
import http from "node:http";
import autocannon from "autocannon";

import { Proxy } from "../../src/lib/Proxy";

const UPSTREAM_HOST = "127.0.0.1";

type Timing = {
  upstreamWait: number;
  responseDelivery: number;
  total: number;
};

// const timings: Timing[] = [];

async function main(): Promise<void> {
  let upstreamRequests = 0;

  const upstream = http.createServer((req, res) => {
    upstreamRequests++;

    const started = process.hrtime.bigint();

    const body = "autocannon-ok";

    res.writeHead(200, {
      "content-type": "text/plain",
      "content-length": Buffer.byteLength(body),
      connection: "keep-alive",
    });

    res.end(body, () => {
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

      if (elapsedMs > 100) {
        console.log(`[UPSTREAM] slow response: ${elapsedMs.toFixed(2)}ms`);
      }
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
    // Use your existing root CA configuration here
    // if your Proxy constructor requires it.
  });

  try {
    await new Promise<void>((resolve) => {
      proxy.listen(0, resolve);
    });

    const proxyPort = (proxy.address() as import("node:net").AddressInfo).port;

    console.log(`[LOAD] Upstream: http://${UPSTREAM_HOST}:${upstreamPort}`);

    console.log(`[LOAD] Proxy: http://127.0.0.1:${proxyPort}`);

    const targetUrl = `http://127.0.0.1:${proxyPort}/`;

    const eventLoopDelay = monitorEventLoopDelay({
      resolution: 10,
    });

    eventLoopDelay.enable();

    const instance = autocannon(
      {
        url: targetUrl,
        connections: 10,
        duration: 5,
        pipelining: 1,
        timeout: 30,

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
          console.error("[LOAD] Autocannon failed:", error);
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

    await new Promise<void>((resolve, reject) => {
      instance.once("done", () => {
        console.log("[LOAD] Autocannon done");
        resolve();
      });

      instance.once("error", reject);
    });

    eventLoopDelay.disable();

    console.log("[LOAD] Event loop delay:", {
      min: (eventLoopDelay.min / 1e6).toFixed(2),
      max: (eventLoopDelay.max / 1e6).toFixed(2),
      mean: (eventLoopDelay.mean / 1e6).toFixed(2),
      p50: (eventLoopDelay.percentile(50) / 1e6).toFixed(2),
      p99: (eventLoopDelay.percentile(99) / 1e6).toFixed(2),
      p999: (eventLoopDelay.percentile(99.9) / 1e6).toFixed(2),
    });

    console.log("[LOAD] Benchmark phase complete");
  } finally {
    console.log("[LOAD] Stopping proxy...");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await proxy.stop();

    console.log("[LOAD] Stopping upstream...");

    console.log(`[LOAD] Upstream requests: ${upstreamRequests}`);

    await new Promise<void>((resolve) => {
      upstream.close(() => resolve());
    });

    console.log("[LOAD] Complete");
  }
}

main().catch((error) => {
  console.error("[LOAD] Fatal error:", error);
  process.exitCode = 1;
});
