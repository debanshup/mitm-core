import assert from "node:assert/strict";
import http from "node:http";
import { Proxy } from "../../../src/lib/Proxy";
import { connectionManager } from "../../../src/core/connection/ConnectionManager";
import { ContextManager } from "../../../src/core/scope/ContextManager";

describe("Proxy startup lifecycle", () => {
  it("rejects listen when the requested port is already in use", async () => {
    const occupiedServer = http.createServer();
    const proxy = new Proxy();

    await new Promise<void>((resolve, reject) => {
      occupiedServer.once("error", reject);
      occupiedServer.listen(0, "127.0.0.1", resolve);
    });

    const address = occupiedServer.address();

    assert.ok(address && typeof address !== "string");

    try {
      await assert.rejects(
        proxy.listen(address.port),
        (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE",
      );
    } finally {
      await proxy.stop();

      await new Promise<void>((resolve, reject) => {
        occupiedServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it("cleans up the server when the startup callback rejects", async () => {
    const proxy = new Proxy();

    await assert.rejects(
      proxy.listen(0, () => {
        throw new Error("startup callback failed");
      }),
      /startup callback failed/,
    );

    assert.equal(
      proxy.address(),
      null,
      "Server should not remain listening after startup callback failure",
    );

    await proxy.stop();
  });

  it("does not leak resources across repeated startup and shutdown cycles", async function () {
    this.timeout(10000);

    const cycles = 5;

    for (let i = 0; i < cycles; i++) {
      const proxy = new Proxy();

      await proxy.listen(0);

      assert.ok(proxy.address(), `Proxy should be listening in cycle ${i + 1}`);

      await proxy.stop();

      assert.equal(
        proxy.address(),
        null,
        `Proxy should be stopped after cycle ${i + 1}`,
      );
    }
  });

  it("does not leak sockets, request contexts, or shutdown listeners across cycles", async function () {
    this.timeout(15000);

    const cycles = 5;

    const upstream = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    const address = upstream.address();
    assert.ok(address && typeof address !== "string");

    const upstreamPort = address.port;

    const baseline = {
      sockets: connectionManager.getCount(),
      requests: ContextManager.getActiveRequests().length,
      sigint: process.listenerCount("SIGINT"),
      sigterm: process.listenerCount("SIGTERM"),
      sighup: process.listenerCount("SIGHUP"),
    };

    const waitForCleanup = async () => {
      const deadline = Date.now() + 2000;

      while (Date.now() < deadline) {
        if (
          connectionManager.getCount() === baseline.sockets &&
          ContextManager.getActiveRequests().length === baseline.requests
        ) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      assert.equal(connectionManager.getCount(), baseline.sockets);
      assert.equal(
        ContextManager.getActiveRequests().length,
        baseline.requests,
      );
    };

    try {
      for (let i = 0; i < cycles; i++) {
        const proxy = new Proxy();

        try {
          await proxy.listen(0);

          const proxyAddress = proxy.address();
          assert.ok(proxyAddress && typeof proxyAddress !== "string");

          await new Promise<void>((resolve, reject) => {
            const req = http.request(
              {
                host: "127.0.0.1",
                port: proxyAddress.port,
                method: "GET",
                path: `http://127.0.0.1:${upstreamPort}/cycle-${i}`,
                headers: {
                  Host: `127.0.0.1:${upstreamPort}`,
                  Connection: "close",
                },
                agent: false,
              },
              (res) => {
                const socket = res.socket;

                res.once("error", reject);

                res.once("end", () => {
                  if (socket.destroyed) {
                    resolve();
                  } else {
                    socket.once("close", resolve);
                  }
                });

                res.resume();
              },
            );

            req.once("error", reject);
            req.end();
          });

          await waitForCleanup();
        } finally {
          await proxy.stop();
        }

        await waitForCleanup();

        assert.equal(process.listenerCount("SIGINT"), baseline.sigint);
        assert.equal(process.listenerCount("SIGTERM"), baseline.sigterm);
        assert.equal(process.listenerCount("SIGHUP"), baseline.sighup);
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        upstream.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });
});
