import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import tls from "node:tls";
import https from "node:https";
import crypto from "node:crypto";
import { Proxy } from "../../src/lib/Proxy";
import { ContextManager } from "../../src/core/scope/ContextManager";
import { connectionManager } from "../../src/core/connection/ConnectionManager";
import { CA_PATH } from "../../constants/path";
import path from "path";

const HOST = "localhost";

const CONNECTIONS = 10;
const REQUESTS_PER_CLIENT = 100;

const CA_CERT = fs.readFileSync(path.join(CA_PATH.CA_DIR, "/CA.crt"), "utf8");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createUpstream(): Promise<https.Server> {
  const upstream = https.createServer(
    {
      // Use your existing test fixture certificate here.
      key: fs.readFileSync("test/fixtures/certs/upstream-key.pem"),
      cert: fs.readFileSync("test/fixtures/certs/upstream-cert.pem"),
    },
    (req, res) => {
      const body = `connect-worker-ok:${req.url}`;

      res.writeHead(200, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(body),
        connection: "close",
      });

      res.end(body);
    },
  );

  await new Promise<void>((resolve) => {
    upstream.listen(0, HOST, resolve);
  });

  return upstream;
}

async function makeConnectRequest(
  proxyPort: number,
  upstreamPort: number,
  requestId: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let connectBuffer = Buffer.alloc(0);
    let tlsStarted = false;

    const socket = net.connect(proxyPort, HOST, () => {
      socket.write(
        [
          `CONNECT localhost:${upstreamPort} HTTP/1.1`,
          `Host: localhost:${upstreamPort}`,
          "Connection: keep-alive",
          "",
          "",
        ].join("\r\n"),
      );
    });

    /*
     * IMPORTANT:
     *
     * Without this timeout, this Promise can stay pending forever.
     * That makes the test look like the proxy itself is frozen.
     */
    const timeout = setTimeout(() => {
      if (settled) return;

      settleReject(
        new Error(`Timeout waiting for CONNECT/TLS for request ${requestId}`),
      );
    }, 10_000);

    const settleResolve = () => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);

      resolve();
    };

    const settleReject = (error: Error) => {
      if (settled) return;

      settled = true;
      clearTimeout(timeout);

      socket.destroy();

      reject(error);
    };

    socket.on("error", (error) => {
      settleReject(error);
    });
    socket.on("data", (chunk: Buffer) => {
      /*
       * Once TLS starts, the underlying socket's data belongs
       * to the TLSSocket. Do not process it as CONNECT response.
       */
      if (tlsStarted) {
        return;
      }

      connectBuffer = Buffer.concat([connectBuffer, chunk]);

      const headerEnd = connectBuffer.indexOf("\r\n\r\n");

      if (headerEnd === -1) {
        return;
      }

      tlsStarted = true;

      const connectResponse = connectBuffer
        .subarray(0, headerEnd + 4)
        .toString();

      if (!/^HTTP\/1\.1 200\b/.test(connectResponse)) {
        settleReject(
          new Error(
            `CONNECT failed for request ${requestId}: ${connectResponse}`,
          ),
        );

        return;
      }

      /*
       * Anything after the CONNECT response belongs to TLS.
       *
       * For this test we don't expect application data
       * before TLS starts.
       */
      // const remaining = connectBuffer.subarray(headerEnd + 4);

      // console.log(
      //   `[CLIENT ${requestId}] bytes after CONNECT headers:`,
      //   remaining.length,
      // );

      const tlsSocket = tls.connect({
        socket,
        servername: HOST,
        ca: CA_CERT,
        rejectUnauthorized: true,
      });
      tlsSocket.once("error", (error) => {
        console.error(
          `[CLIENT ${requestId}] TLS ERROR:`,
          (error as NodeJS.ErrnoException).code,
          error.message,
        );
        settleReject(error);
      });
      tlsSocket.once("secureConnect", async () => {
        const caCert = new crypto.X509Certificate(CA_CERT);

        tlsSocket.once("secureConnect", () => {
          const peer = tlsSocket.getPeerCertificate();
          const peerCert = new crypto.X509Certificate(peer.raw);

          console.log("[CLIENT] SIGNATURE VERIFY:", {
            verifiedByCA: peerCert.verify(caCert.publicKey),
          });
        });
        try {
          await sendHttpsRequest(tlsSocket, requestId);

          settleResolve();
        } catch (error) {
          settleReject(error as Error);
        }
      });

      tlsSocket.once("error", (error) => {
        // console.error(
        //   `[CLIENT ${requestId}] TLS ERROR`,
        //   (error as NodeJS.ErrnoException).code,
        //   error.message,
        // );

        settleReject(error);
      });

      // tlsSocket.once("close", () => {
      //   console.log(`[CLIENT ${requestId}] TLS CLOSE`);
      // });
    });
  });
}

function sendHttpsRequest(
  socket: tls.TLSSocket,
  requestId: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let responseData = "";

    socket.setEncoding("utf8");

    socket.on("data", (chunk: string) => {
      responseData += chunk;
    });

    socket.once("end", () => {
      try {
        const [headerPart, body = ""] = responseData.split("\r\n\r\n", 2);

        const statusLine = headerPart.split("\r\n")[0];

        const statusCode = Number(statusLine.split(" ")[1]);

        assert.equal(statusCode, 200);

        assert.equal(body, `connect-worker-ok:/stress/${requestId}`);

        resolve();
      } catch (error) {
        console.error(`[CLIENT ${requestId}] response assertion failed`, error);

        reject(error);
      } finally {
        socket.destroy();
      }
    });

    socket.once("error", (error) => {
      console.error(
        `[CLIENT ${requestId}] HTTPS response ERROR`,
        (error as NodeJS.ErrnoException).code,
        error.message,
      );

      reject(error);
    });

    socket.write(
      [
        `GET /stress/${requestId} HTTP/1.1`,
        `Host: ${HOST}`,
        "Connection: close",
        "",
        "",
      ].join("\r\n"),
    );
  });
}

async function main(): Promise<void> {
  const upstream = await createUpstream();

  const upstreamPort = (upstream.address() as net.AddressInfo).port;

  const rootCa = {
    key: fs.readFileSync(path.join(CA_PATH.CA_DIR, "/key.pem"), "utf8"),
    cert: fs.readFileSync(path.join(CA_PATH.CA_DIR, "/CA.crt"), "utf8"),
  };

  const proxy = new Proxy({
    rootCa,
    useDefaultPipelines: true,
    useCertificateCache: false,
    useResponseCache: false,
  });

  await new Promise<void>((resolve) => {
    proxy.listen(0, resolve);
  });

  const proxyPort = (proxy.address() as net.AddressInfo).port;

  // ---------------------------------------------------------
  // Baseline
  // ---------------------------------------------------------

  if (global.gc) {
    global.gc();
  }

  const resourcesBefore = getProcessResources();

  console.log("\n[CONNECT WORKER] Process Resources (Before Load):");
  console.table(resourcesBefore);

  const totalRequests = CONNECTIONS * REQUESTS_PER_CLIENT;

  // ---------------------------------------------------------
  // Repeated load
  // ---------------------------------------------------------

  for (let run = 1; run <= 3; run++) {
    console.log(`\n[CONNECT WORKER] ===== RUN ${run} =====`);

    const start = Date.now();

    const { successful, failed } = await runLoad();

    const duration = Date.now() - start;

    const throughput = (successful / Math.max(duration / 1000, 0.001)).toFixed(
      2,
    );

    console.table({
      "Total Requests": totalRequests,
      Successful: successful,
      Failed: failed,
      "Success Rate (%)": ((successful / totalRequests) * 100).toFixed(2),
      "Duration (ms)": duration,
      "Throughput (Req/sec)": throughput,
    });

    // Let V8 collect garbage before measuring retained memory.
    if (global.gc) {
      global.gc();
    }

    const resources = getProcessResources();

    console.log(`[CONNECT WORKER] Resources After Run ${run}:`);
    console.table(resources);

    const activeRequests = ContextManager.getActiveRequests().length;

    const activeConnections = connectionManager.getCount();

    console.log(`[CONNECT WORKER] Lifecycle State After Run ${run}:`);

    console.table({
      "Active Requests": activeRequests,
      "Active Connections": activeConnections,
    });

    // -------------------------------------------------------
    // Per-run assertions
    // -------------------------------------------------------

    assert.equal(failed, 0, `Run ${run}: CONNECT/TLS requests failed`);

    assert.equal(activeRequests, 0, `Run ${run}: request contexts leaked`);

    assert.equal(activeConnections, 0, `Run ${run}: connections leaked`);
  }

  // ---------------------------------------------------------
  // Pre-shutdown state
  // ---------------------------------------------------------

  console.log("\n[CONNECT WORKER] Resource State (Pre-Shutdown):");

  console.table({
    "Active Requests (Memory Contexts)":
      ContextManager.getActiveRequests().length,

    "Active Connections (TCP Sockets)": connectionManager.getCount(),
  });

  // ---------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------

  console.log("\n[CONNECT WORKER] Stopping proxy...");

  await proxy.stop();

  await new Promise<void>((resolve) => {
    upstream.close(() => resolve());
  });

  // ---------------------------------------------------------
  // Post-shutdown resources
  // ---------------------------------------------------------

  if (global.gc) {
    global.gc();
  }

  const resourcesAfterShutdown = getProcessResources();

  console.log("\n[CONNECT WORKER] Process Resources (Post-Shutdown):");
  console.table(resourcesAfterShutdown);

  const activeRequests = ContextManager.getActiveRequests().length;

  const activeConnections = connectionManager.getCount();

  console.log("\n[CONNECT WORKER] Resource State (Post-Shutdown):");

  console.table({
    "Active Requests (Memory Contexts)": activeRequests,

    "Active Connections (TCP Sockets)": activeConnections,
  });

  // ---------------------------------------------------------
  // Final resource delta
  // ---------------------------------------------------------

  console.log("\n[CONNECT WORKER] Resource Delta:");

  console.table({
    "RSS Delta (MB)": resourcesAfterShutdown.rssMB - resourcesBefore.rssMB,

    "Heap Delta (MB)":
      resourcesAfterShutdown.heapUsedMB - resourcesBefore.heapUsedMB,

    "Active Handles Delta":
      resourcesAfterShutdown.activeHandles - resourcesBefore.activeHandles,

    "Active Requests Delta":
      resourcesAfterShutdown.activeRequests - resourcesBefore.activeRequests,
  });

  // ---------------------------------------------------------
  // Final assertions
  // ---------------------------------------------------------

  assert.equal(activeRequests, 0, "Request contexts leaked after shutdown");

  assert.equal(activeConnections, 0, "Connections leaked after shutdown");

  console.log("\n[CONNECT WORKER] All assertions passed");

  // ---------------------------------------------------------
  // Load function
  // ---------------------------------------------------------

  async function runLoad() {
    let successful = 0;
    let failed = 0;

    const clients = Array.from(
      { length: CONNECTIONS },
      async (_, clientIndex) => {
        for (
          let requestIndex = 0;
          requestIndex < REQUESTS_PER_CLIENT;
          requestIndex++
        ) {
          const requestId = clientIndex * REQUESTS_PER_CLIENT + requestIndex;

          try {
            await makeConnectRequest(proxyPort, upstreamPort, requestId);

            successful++;
          } catch {
            failed++;
          }

          await sleep(Math.random() * 10);
        }
      },
    );

    await Promise.all(clients);

    return {
      successful,
      failed,
    };
  }

  function getProcessResources() {
    const memory = process.memoryUsage();

    return {
      rssMB: +(memory.rss / 1024 / 1024).toFixed(2),

      heapUsedMB: +(memory.heapUsed / 1024 / 1024).toFixed(2),

      heapTotalMB: +(memory.heapTotal / 1024 / 1024).toFixed(2),

      externalMB: +(memory.external / 1024 / 1024).toFixed(2),

      arrayBuffersMB: +(memory.arrayBuffers / 1024 / 1024).toFixed(2),

      activeHandles: (process as any)._getActiveHandles().length,

      activeRequests: (process as any)._getActiveRequests().length,
    };
  }
}

main().catch((error) => {
  console.error("[CONNECT WORKER] Fatal error:", error);

  process.exitCode = 1;
});
