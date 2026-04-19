import assert from "node:assert";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { describe, it, before, after } from "mocha";
import { Proxy } from "../../src/index"; // Adjust path as needed
import { generateForgeCertificates } from "../utils";

let originalTlsEnv: string | undefined;

describe("Proxy Integrity Test: End-to-End HTTPS Traffic Routing", () => {
  let proxy: Proxy;
  let targetServer: https.Server;

  const PROXY_PORT = 8002;
  const TARGET_PORT = 9002;

  // Updated to reflect the HTTPS lifecycle events
  const hooksFired = {
    tunnelConnect: false,
    decryptedRequest: false,
    decryptedResponse: false,
  };

  before(async () => {
    originalTlsEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    // Generate cert and key for dummy server
    const { key, cert } = generateForgeCertificates();

    // Start target server
    targetServer = https.createServer({ key, cert }, (req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "X-Target-Header": "Success-HTTPS",
      });
      res.end("Secure Hello from the Target Server!");
    });

    await new Promise<void>((resolve) =>
      targetServer.listen(TARGET_PORT, resolve),
    );

    // Initialize Proxy
    proxy = new Proxy();

    // --- BIND THE NEW UNIFIED EVENTS ---

    // 1. The initial tunneling request
    proxy.on("tunnel:connect", async ({ req }) => {
      hooksFired.tunnelConnect = true;
    });

    // 2. The intercepted payload going to the target
    proxy.on("http:decrypted_request", async ({ ctx }) => {
      hooksFired.decryptedRequest = true;
    });

    // 3. The intercepted payload coming back from the target
    proxy.on("decrypted_response", async ({ ctx }) => {
      hooksFired.decryptedResponse = true;
    });

    await new Promise<void>((resolve) => {
      proxy.listen(PROXY_PORT, () => resolve());
    });
  });

  after((done) => {
    // Restore TLS env
    if (originalTlsEnv === undefined)
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsEnv;

    proxy.stop();
    targetServer.closeAllConnections();
    targetServer.close(done);
  });

  it("should successfully MITM an HTTPS request, decrypt it, and trigger hooks", (done) => {
    let isDone = false;
    const finish = (err?: Error | unknown) => {
      if (isDone) return;
      isDone = true;
      if (err) done(err);
      else done();
    };

    // 1. Initiate the CONNECT tunnel to the Proxy
    const connectReq = http.request({
      hostname: "127.0.0.1",
      port: PROXY_PORT,
      method: "CONNECT",
      path: `127.0.0.1:${TARGET_PORT}`,
    });

    connectReq.on("connect", (res, socket) => {
      // 2. Upgrade the raw socket to TLS
      const proxyAgent = new https.Agent({ keepAlive: false });
      proxyAgent.createConnection = () => {
        return tls.connect({
          socket: socket,
          servername: "127.0.0.1",
          rejectUnauthorized: false, // Accept the forged MITM cert
        });
      };

      // 3. Send the actual encrypted GET request through the tunnel
      const httpsReq = https.request(
        {
          hostname: "127.0.0.1",
          port: TARGET_PORT,
          path: "/secure-test-path",
          method: "GET",
          agent: proxyAgent,
          headers: {
            Host: `127.0.0.1:${TARGET_PORT}`,
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });

          res.on("end", () => {
            try {
              // Assert target server behavior
              assert.strictEqual(res.statusCode, 200);
              assert.strictEqual(
                res.headers["x-target-header"],
                "Success-HTTPS",
              );
              assert.strictEqual(body, "Secure Hello from the Target Server!");

              // Assert the proxy plugin architecture successfully hooked the pipeline
              assert.strictEqual(
                hooksFired.tunnelConnect,
                true,
                "tunnel:connect event did not fire",
              );
              assert.strictEqual(
                hooksFired.decryptedRequest,
                true,
                "http:decrypted_request event did not fire",
              );
              assert.strictEqual(
                hooksFired.decryptedResponse,
                true,
                "http:decrypted_response event did not fire",
              );

              finish();
            } catch (err) {
              finish(err);
            } finally {
              if (!socket.destroyed) socket.destroy();
            }
          });
        },
      );

      httpsReq.on("error", (err) =>
        finish(new Error(`HTTPS Request Error: ${err.message}`)),
      );
      httpsReq.end();
    });

    connectReq.on("error", (err) =>
      finish(new Error(`CONNECT Request Error: ${err.message}`)),
    );
    connectReq.end();
  });
});
