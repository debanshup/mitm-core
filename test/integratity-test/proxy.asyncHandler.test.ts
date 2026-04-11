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

  it("should await an async [http:plain_request] plugin before continuing the pipeline", (done) => {
    let asyncWorkCompleted = false;
    proxy.on("http:plain_request", async ({ req, res }) => {
      await new Promise((resolve) => setTimeout(resolve, 50));

      asyncWorkCompleted = true;

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

          done();
        } catch (err) {
          done(err);
        }
      },
    );

    req.on("error", done);
    req.end();
  });

  it("should await an async [tunnel:connect] plugin before continuing the pipeline", (done) => {
    let asyncWorkCompleted = false;

    proxy.on("tunnel:connect", async ({ req, socket, head, events }) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      asyncWorkCompleted = true;
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
