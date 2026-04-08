import assert from "node:assert";
import http from "node:http";
import { describe, it, before, after } from "mocha";
import { Proxy } from "../../src/index.ts";

describe("Proxy Core: Async Lifecycle Handlers", () => {
  let proxy: Proxy;
  const PROXY_PORT = 8002;

  before(async () => {
    proxy = new Proxy();
    await new Promise<void>((resolve) => proxy.listen(PROXY_PORT, resolve));
  });

  after((done) => {
    proxy.stop();
    done();
  });

  it("should await an async [onHttpRequest] handler before continuing the pipeline", (done) => {
    let asyncWorkCompleted = false;
    let defaultHandlerFired = false;
    proxy.onHttpRequest(async (req, res, defaultHandler) => {
      await new Promise((resolve) => setTimeout(resolve, 50));

      asyncWorkCompleted = true;

      const wrappedDefault = () => {
        defaultHandlerFired = true;
        defaultHandler();
      };

      wrappedDefault();

      res.writeHead(200);
      res.end("Async test complete");
    });

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PROXY_PORT,
        path: "/",
        method: "GET",
      },
      (res) => {
        try {
          assert.strictEqual(
            asyncWorkCompleted,
            true,
            "The async work did not complete before the response was sent",
          );
          assert.strictEqual(
            defaultHandlerFired,
            true,
            "The defaultHandler was never called",
          );
          done();
        } catch (err) {
          done(err);
        }
      },
    );

    req.on("error", done);
    req.end();
  });

  it("should await an async [onConnect] handler before continuing the pipeline", (done) => {
    let asyncWorkCompleted = false;

    proxy.onConnect(async (req, socket, head, events, defaultHandler) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      asyncWorkCompleted = true;
      defaultHandler();
    });
    const connectReq = http.request({
      hostname: "127.0.0.1",
      port: PROXY_PORT,
      method: "CONNECT",
      path: "example.com:443", // dummy destination
    });

    connectReq.on("connect", (res, socket) => {
      try {
        assert.strictEqual(
          asyncWorkCompleted,
          true,
          "The CONNECT event was emitted before the async handler resolved",
        );

        socket.destroy();
        done();
      } catch (err) {
        if (!socket.destroyed) socket.destroy();
        done(err);
      }
    });

    connectReq.on("error", done);
    connectReq.end();
  });
});
