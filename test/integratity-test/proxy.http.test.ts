import assert from "node:assert";
import http from "node:http";
import { describe, it, before, after } from "mocha";
import { Middleware, Proxy } from "../../src/index.ts";

describe("Proxy Integrity Test: End-to-End Traffic Routing", () => {
  let proxy: Proxy;
  let targetServer: http.Server;
  Middleware.register({ initializePipelines: true });

  const PROXY_PORT = 8001;
  const TARGET_PORT = 9001;

  let hooksFired = {
    httpRequest: false,
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

    proxy.onTCPconnection((socket, defaultHandler) => defaultHandler());
    proxy.onConnect((req, socket, head, events, defaultHandler) =>
      defaultHandler(),
    );

    proxy.onHttpRequest((req, res, defaultHandler) => {
      hooksFired.httpRequest = true;
      defaultHandler();
    });

    proxy.onDecryptedRequest(({ ctx }) => {
      // won't fire for plain HTTP
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
    proxy.stop();
    targetServer.closeAllConnections();
    targetServer.close(done);
  });

  it("should successfully route an HTTP request through the proxy and trigger hooks", (done) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: PROXY_PORT,
      path: `http://127.0.0.1:${TARGET_PORT}/test-path`, // full url
      method: "GET",
      headers: {
        Host: `127.0.0.1:${TARGET_PORT}`, //  host header must match the target!
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
          hooksFired.httpRequest,
          true,
          "onHttpRequest hook did not fire",
        );
        assert.strictEqual(
          hooksFired.responseData,
          true,
          "onResponseData hook did not fire",
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
