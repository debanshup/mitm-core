import assert from "node:assert";
import http from "node:http";
import { describe, it, before, after } from "mocha";
import {   Proxy } from "../../src/index.ts"; // Adjust path as needed
import { Middleware } from "../../src/middleware/middleware.ts";

describe("Proxy Integrity Test: End-to-End Traffic Routing", () => {
  let proxy: Proxy;
  let targetServer: http.Server;

  Middleware.register({ initializePipelines: true });

  const PROXY_PORT = 8001;
  const TARGET_PORT = 9001;

  const hooksFired = {
    plainRequest: false,
    responseData: false,
  };

  before(async () => {
    targetServer = http.createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "X-Target-Header": "Success",
      });
      res.end("Hello from the Target Server!");
    });

    await new Promise<void>((resolve) =>
      targetServer.listen(TARGET_PORT, resolve),
    );

    proxy = new Proxy();

    proxy.on("http:plain_request", async ({ req, res }) => {
      hooksFired.plainRequest = true;
    });

    proxy.on("decrypted_response", async ({ ctx }) => {
      hooksFired.responseData = true;
    });

    await new Promise<void>((resolve) => {
      proxy.listen(PROXY_PORT, () => resolve());
    });
  });

  after((done) => {
    proxy.stop();
    targetServer.closeAllConnections();
    targetServer.close(done);
  });

  it("should successfully route an HTTP request through the proxy and trigger hooks", (done) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: PROXY_PORT,
      path: `http://127.0.0.1:${TARGET_PORT}/test-path`,
      method: "GET",
      headers: {
        Host: `127.0.0.1:${TARGET_PORT}`,
      },
    };

    const req = http.request(options, (res) => {
      assert.strictEqual(res.statusCode, 200, "Expected status code 200");
      assert.strictEqual(
        res.headers["x-target-header"],
        "Success",
        "Expected target headers to be preserved",
      );

      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        assert.strictEqual(
          body,
          "Hello from the Target Server!",
          "Expected body to be preserved",
        );

        assert.strictEqual(
          hooksFired.plainRequest,
          true,
          "http:plain_request event did not fire",
        );

        done();
      });
    });

    req.on("error", (err) => {
      done(err);
    });

    req.end();
  });
});
