import assert from "node:assert";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { describe, it, before, after } from "mocha";
import { Middleware, Proxy } from "../../src/index.ts";
import { generateForgeCertificates } from "../utils.ts";

let originalTlsEnv: string | undefined;
describe("Proxy Integrity Test: End-to-End HTTPS Traffic Routing", () => {
  Middleware.register({ initializePipelines: true });
  let proxy: Proxy;
  let targetServer: https.Server;

  const PROXY_PORT = 8001;
  const TARGET_PORT = 9001;

  let hooksFired = {
    httpRequest: false,
    decryptedRequest: false,
    responseData: false,
  };

  before(async () => {
    originalTlsEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    // generate cert and key for dummy server
    const { key, cert } = generateForgeCertificates();
    // start target server
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

    proxy = new Proxy();

    proxy.onTCPconnection((socket, defaultHandler) => defaultHandler());
    proxy.onConnect((req, socket, head,events,  defaultHandler) => defaultHandler());

    proxy.onHttpRequest((req, res, defaultHandler) => {
      hooksFired.httpRequest = true;
      if (defaultHandler) defaultHandler();
    });

    proxy.onDecryptedRequest(({ ctx }) => {
      hooksFired.decryptedRequest = true;
    });

    proxy.onResponseData(({ ctx }) => {
      hooksFired.responseData = true;
    });

    proxy.onError((err) => {
      console.error("[Test Proxy Error]", err.message);
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

    const connectReq = http.request({
      hostname: "127.0.0.1",
      port: PROXY_PORT,
      method: "CONNECT",
      path: `127.0.0.1:${TARGET_PORT}`,
    });

    connectReq.on("connect", (res, socket) => {
      const proxyAgent = new https.Agent({ keepAlive: false });
      proxyAgent.createConnection = () => {
        return tls.connect({
          socket: socket,
          servername: "localhost",
          rejectUnauthorized: false,
        });
      };

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
              assert.strictEqual(res.statusCode, 200);
              assert.strictEqual(
                res.headers["x-target-header"],
                "Success-HTTPS",
              );
              assert.strictEqual(body, "Secure Hello from the Target Server!");
              assert.strictEqual(hooksFired.decryptedRequest, true);
              assert.strictEqual(hooksFired.responseData, true);

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
