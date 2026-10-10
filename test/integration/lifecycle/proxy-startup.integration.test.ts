import assert from "node:assert/strict";
import http from "node:http";
import { Proxy } from "../../../src/lib/Proxy";

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
});
