import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import net from "node:net";

import { Proxy } from "../../../src/lib/Proxy";
import { ContextManager } from "../../../src/core/scope/ContextManager";

import { TEST_CA_DIR } from "../../constants/path";
import path from "node:path";

const CA_CERT = fs.readFileSync(path.join(TEST_CA_DIR, "CA.pem"), "utf8");
const CA_KEY = fs.readFileSync(path.join(TEST_CA_DIR, "key.pem"), "utf8");

describe("HTTP Error Path Matrix", () => {
  let upstream: http.Server;
  let proxy: Proxy;

  let upstreamPort: number;
  let proxyPort: number;

  beforeEach(async () => {
    upstream = http.createServer();

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    proxy = new Proxy({
      useDefaultPipelines: true,
      useCertificateCache: false,
      useResponseCache: false,
      rootCa: {
        cert: CA_CERT,
        key: CA_KEY,
      },
    });

    await new Promise<void>((resolve) => {
      proxy.listen(0, resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;
    proxyPort = (proxy.address() as net.AddressInfo).port;
  });

  afterEach(async () => {
    await proxy.stop();

    await new Promise<void>((resolve) => {
      if (!upstream.listening) {
        resolve();
        return;
      }

      upstream.close(() => resolve());
    });
  });

  it("handles an upstream reset during the response", async () => {
    upstream = http.createServer((_req, res) => {
      res.writeHead(200, {
        "content-type": "text/plain",
        connection: "keep-alive",
      });

      res.write("partial");

      setTimeout(() => {
        res.socket?.destroy();
      }, 50);
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: proxyPort,
          method: "GET",
          path: `http://127.0.0.1:${upstreamPort}/reset`,
        },
        (res) => {
          let body = "";

          res.on("data", (chunk) => {
            body += chunk.toString();
          });

          res.on("aborted", () => {
            assert.ok(body.includes("partial"));
            resolve();
          });

          res.on("end", () => {
            reject(
              new Error(
                `Expected aborted response, received complete response: ${body}`,
              ),
            );
          });

          res.on("error", reject);
        },
      );

      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNRESET") {
          resolve();
          return;
        }

        reject(err);
      });

      req.end();
    });
  });

  it("handles an upstream reset during the request body", async () => {
    upstream = http.createServer((req) => {
      req.once("data", () => {
        req.socket.destroy();
      });
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port: proxyPort,
        method: "POST",
        path: `http://127.0.0.1:${upstreamPort}/reset`,
        headers: {
          "content-type": "application/octet-stream",
          "transfer-encoding": "chunked",
        },
      });

      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;

        settled = true;

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      req.on("response", (res) => {
        // We expect the proxy to return a 502 Bad Gateway
        if (res.statusCode === 502) {
          res.socket?.once("close", () => finish());
        }
      });

      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNRESET" || err.code === "EPIPE") {
          finish();
          return;
        }
        finish(err);
      });

      // Safely attach to the socket once Node assigns it
      req.on("socket", (socket) => {
        socket.once("close", () => {
          finish();
        });
      });

      req.write(Buffer.alloc(64 * 1024, "x"));

      setTimeout(() => {
        if (!settled) {
          req.write(Buffer.alloc(64 * 1024, "y"));
        }
      }, 100);

      setTimeout(() => {
        if (!settled) {
          req.end();
        }
      }, 200);

      setTimeout(() => {
        if (!settled) {
          finish(
            new Error("Client connection did not close after upstream reset"),
          );
        }
      }, 1000);
    });
  });

  it("returns 502 when the upstream connection is refused", async () => {
    // Stop the current upstream so its port becomes unreachable.
    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: proxyPort,
          method: "GET",
          path: `http://127.0.0.1:${upstreamPort}/refused`,
          headers: {
            Host: `127.0.0.1:${upstreamPort}`,
          },
        },
        (res) => {
          let body = "";

          res.on("data", (chunk) => {
            body += chunk.toString();
          });

          res.on("end", () => {
            try {
              assert.equal(res.statusCode, 502);
              assert.match(body, /Bad Gateway/i);
              resolve();
            } catch (err) {
              reject(err);
            }
          });

          res.on("error", reject);
        },
      );

      req.on("error", (err) => {
        reject(err);
      });

      req.end();
    });
  });

  it("returns 502 when the upstream closes before response headers", async () => {
    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    upstream = http.createServer((req) => {
      req.socket.destroy();
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: proxyPort,
          method: "GET",
          path: `http://127.0.0.1:${upstreamPort}/early-close`,
          headers: {
            Host: `127.0.0.1:${upstreamPort}`,
          },
        },
        (res) => {
          let body = "";

          res.on("data", (chunk) => {
            body += chunk.toString();
          });

          res.on("end", () => {
            try {
              assert.equal(res.statusCode, 502);
              assert.match(body, /Bad Gateway/i);
              resolve();
            } catch (err) {
              reject(err);
            }
          });

          res.on("error", reject);
        },
      );

      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNRESET") {
          resolve();
          return;
        }

        reject(err);
      });

      req.end();
    });
  });

  it("destroys the upstream connection when the client disconnects during streaming", async function () {
    this.timeout(5000);

    let resolveUpstreamClosed!: () => void;

    const upstreamClosed = new Promise<void>((resolve) => {
      resolveUpstreamClosed = resolve;
    });

    let upstreamSocket: net.Socket | undefined;

    upstream = http.createServer((_req, res) => {
      const timer = setInterval(() => {
        if (!res.destroyed) {
          res.write("streaming-data");
        }
      }, 20);

      res.writeHead(200, {
        "content-type": "text/plain",
        connection: "keep-alive",
      });

      res.write("first-chunk");

      res.socket?.once("close", () => {
        clearInterval(timer);
        resolveUpstreamClosed();
      });
    });

    upstream.on("connection", (socket) => {
      upstreamSocket = socket;
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    const clientClosed = new Promise<void>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: `http://127.0.0.1:${upstreamPort}/stream-disconnect`,
        headers: {
          Host: `127.0.0.1:${upstreamPort}`,
        },
      });

      req.once("response", (res) => {
        res.once("data", () => {
          // Simulate the client disappearing after receiving data.
          res.destroy();
        });

        res.once("close", resolve);

        res.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code !== "ECONNRESET") {
            reject(err);
          }
        });
      });

      req.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code !== "ECONNRESET") {
          reject(err);
        }
      });

      req.end();
    });

    await Promise.all([clientClosed, upstreamClosed]);

    assert.ok(upstreamSocket, "Expected an upstream socket");
    assert.equal(
      upstreamSocket.destroyed,
      true,
      "Expected upstream socket to be destroyed",
    );
  });

  it("cleans up the upstream request when the client disconnects during connection", async () => {
    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    let upstreamRequestReceived = false;
    let upstreamSocketClosed = false;

    upstream = http.createServer((_req, res) => {
      upstreamRequestReceived = true;

      // Keep the upstream request open.
      res.writeHead(200, {
        "content-type": "text/plain",
        connection: "keep-alive",
      });

      const timer = setTimeout(() => {
        res.end("too late");
      }, 2000);

      res.socket?.once("close", () => {
        upstreamSocketClosed = true;
        clearTimeout(timer);
      });
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: `http://127.0.0.1:${upstreamPort}/client-disconnect`,
        headers: {
          Host: `127.0.0.1:${upstreamPort}`,
          Connection: "keep-alive",
        },
      });

      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;

        settled = true;

        if (error) reject(error);
        else resolve();
      };

      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNRESET" || err.code === "EPIPE") {
          finish();
          return;
        }

        finish(err);
      });

      req.on("socket", (socket) => {
        socket.once("connect", () => {
          // Give the proxy a moment to establish the upstream request,
          // then simulate the client disappearing.
          setTimeout(() => {
            req.destroy();
          }, 50);
        });
      });

      req.end();

      setTimeout(() => {
        if (!settled) {
          finish(
            new Error("Client request did not terminate after disconnect"),
          );
        }
      }, 1000);
    });

    // Give the proxy cleanup handlers a moment to run.
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(upstreamRequestReceived, true);
    assert.equal(upstreamSocketClosed, true);
  });

  it("destroys the upstream request when the client disconnects before response headers", async () => {
    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    let upstreamRequestReceived = false;
    let upstreamSocketClosed = false;

    upstream = http.createServer((_req, res) => {
      upstreamRequestReceived = true;

      const timer = setTimeout(() => {
        if (!res.destroyed) {
          res.writeHead(200, {
            "content-type": "text/plain",
            connection: "keep-alive",
          });
          res.end("too late");
        }
      }, 1000);

      res.socket?.once("close", () => {
        upstreamSocketClosed = true;
        clearTimeout(timer);
      });
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: `http://127.0.0.1:${upstreamPort}/disconnect-before-headers`,
        headers: {
          Host: `127.0.0.1:${upstreamPort}`,
          Connection: "keep-alive",
        },
      });

      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;

        settled = true;

        if (error) reject(error);
        else resolve();
      };

      req.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNRESET" || err.code === "EPIPE") {
          finish();
          return;
        }

        finish(err);
      });

      req.end();

      // Wait until the proxy has actually reached the upstream.
      const waitForUpstream = () => {
        if (upstreamRequestReceived) {
          setTimeout(() => {
            req.destroy();
          }, 50);

          return;
        }

        setImmediate(waitForUpstream);
      };

      waitForUpstream();

      setTimeout(() => {
        if (!settled) {
          finish(
            new Error("Client request did not terminate after disconnect"),
          );
        }
      }, 1500);
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(
      upstreamRequestReceived,
      true,
      "Expected upstream request to be received",
    );

    assert.equal(
      upstreamSocketClosed,
      true,
      "Expected upstream socket to be closed after client disconnect",
    );
  });

  it("cleans up the request lifecycle when the client disconnects during streaming", async function () {
    this.timeout(5000);

    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const activeRequestsBefore = ContextManager.getActiveRequests().length;

    let resolveUpstreamSocketClosed!: () => void;

    const upstreamSocketClosed = new Promise<void>((resolve) => {
      resolveUpstreamSocketClosed = resolve;
    });

    upstream = http.createServer((req, res) => {
      const socket = req.socket;

      const timer = setInterval(() => {
        if (!res.destroyed && res.writable) {
          res.write("streaming-data");
        }
      }, 20);

      socket.once("close", () => {
        clearInterval(timer);
        resolveUpstreamSocketClosed();
      });

      res.writeHead(200, {
        "content-type": "text/plain",
        connection: "keep-alive",
      });

      res.write("first-chunk");
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    const clientClosed = new Promise<void>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: `http://127.0.0.1:${upstreamPort}/stream-disconnect`,
        headers: {
          Host: `127.0.0.1:${upstreamPort}`,
        },
      });

      let disconnected = false;

      req.once("response", (res) => {
        res.once("close", resolve);

        res.on("data", () => {
          if (disconnected) return;

          disconnected = true;

          // Simulate the client disappearing after receiving data.
          res.destroy();
        });

        res.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code !== "ECONNRESET") {
            reject(err);
          }
        });
      });

      req.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code !== "ECONNRESET" && err.code !== "EPIPE") {
          reject(err);
        }
      });

      req.end();
    });

    await Promise.all([clientClosed, upstreamSocketClosed]);

    // Allow the proxy's close handlers to finish.
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(
      ContextManager.getActiveRequests().length,
      activeRequestsBefore,
      "Expected the disconnected request context to be removed",
    );
  });

  it("waits for active HTTP requests to finish before shutting down", async function () {
    this.timeout(5000);

    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const activeRequestsBefore = ContextManager.getActiveRequests().length;

    let resolveUpstreamRequest!: () => void;

    const upstreamRequestReceived = new Promise<void>((resolve) => {
      resolveUpstreamRequest = resolve;
    });

    upstream = http.createServer((_req, res) => {
      resolveUpstreamRequest();

      res.writeHead(200, {
        "content-type": "text/plain",
        connection: "keep-alive",
      });

      res.write("started");

      setTimeout(() => {
        res.end("finished");
      }, 200);
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    const clientResponse = new Promise<string>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: `http://127.0.0.1:${upstreamPort}/graceful-shutdown`,
        headers: {
          Host: `127.0.0.1:${upstreamPort}`,
        },
      });

      const chunks: Buffer[] = [];

      req.once("response", (res) => {
        res.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        res.once("end", () => {
          resolve(Buffer.concat(chunks).toString());
        });

        res.once("error", reject);
      });

      req.once("error", reject);
      req.end();
    });

    await upstreamRequestReceived;

    assert.ok(
      ContextManager.getActiveRequests().length > activeRequestsBefore,
      "Expected an active request before shutdown",
    );

    const shutdownPromise = proxy.stop(1000);

    const body = await clientResponse;
    await shutdownPromise;

    assert.equal(body, "startedfinished");

    assert.equal(
      ContextManager.getActiveRequests().length,
      activeRequestsBefore,
      "Expected active request contexts to be cleaned up",
    );
  });

  it("force-closes active requests when the shutdown timeout expires", async function () {
    this.timeout(5000);

    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const activeRequestsBefore = ContextManager.getActiveRequests().length;

    let resolveUpstreamRequest!: () => void;
    let resolveClientReceivedData!: () => void;
    let resolveUpstreamSocketClosed!: () => void;

    const upstreamRequestReceived = new Promise<void>((resolve) => {
      resolveUpstreamRequest = resolve;
    });

    const clientReceivedData = new Promise<void>((resolve) => {
      resolveClientReceivedData = resolve;
    });

    const upstreamSocketClosed = new Promise<void>((resolve) => {
      resolveUpstreamSocketClosed = resolve;
    });

    upstream = http.createServer((_req, res) => {
      const timer = setInterval(() => {
        if (!res.destroyed && res.writable) {
          res.write("streaming-data");
        }
      }, 20);

      res.socket?.once("close", () => {
        clearInterval(timer);
        resolveUpstreamSocketClosed();
      });

      res.writeHead(200, {
        "content-type": "text/plain",
        connection: "keep-alive",
      });

      res.write("first-chunk");

      resolveUpstreamRequest();
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    const clientTerminated = new Promise<void>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: `http://127.0.0.1:${upstreamPort}/forced-shutdown`,
        headers: {
          Host: `127.0.0.1:${upstreamPort}`,
        },
      });

      req.once("response", (res) => {
        res.once("data", resolveClientReceivedData);

        res.once("close", resolve);

        res.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ECONNRESET") {
            resolve();
          } else {
            reject(err);
          }
        });
      });

      req.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNRESET" || err.code === "EPIPE") {
          resolve();
        } else {
          reject(err);
        }
      });

      req.end();
    });

    await upstreamRequestReceived;
    await clientReceivedData;

    assert.ok(
      ContextManager.getActiveRequests().length > activeRequestsBefore,
      "Expected an active request before forced shutdown",
    );

    await proxy.stop(100);

    await Promise.all([clientTerminated, upstreamSocketClosed]);

    assert.equal(
      ContextManager.getActiveRequests().length,
      activeRequestsBefore,
      "Expected forced shutdown to clear active request contexts",
    );
  });

  it("force-closes multiple concurrent active requests during shutdown", async function () {
    this.timeout(5000);

    const requestCount = 3;

    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const activeRequestsBefore = ContextManager.getActiveRequests().length;

    let receivedRequests = 0;
    let resolveAllRequestsReceived!: () => void;
    let resolveAllUpstreamSocketsClosed!: () => void;

    const allRequestsReceived = new Promise<void>((resolve) => {
      resolveAllRequestsReceived = resolve;
    });

    const upstreamSockets = new Set<net.Socket>();
    let closedSocketCount = 0;

    const allUpstreamSocketsClosed = new Promise<void>((resolve) => {
      resolveAllUpstreamSocketsClosed = resolve;
    });

    upstream = http.createServer((_req, res) => {
      receivedRequests++;

      if (receivedRequests === requestCount) {
        resolveAllRequestsReceived();
      }

      const timer = setInterval(() => {
        if (!res.destroyed && res.writable) {
          res.write("streaming-data");
        }
      }, 20);

      res.socket?.once("close", () => {
        clearInterval(timer);
      });

      res.writeHead(200, {
        "content-type": "text/plain",
        connection: "keep-alive",
      });

      res.write("first-chunk");
    });

    upstream.on("connection", (socket) => {
      upstreamSockets.add(socket);

      socket.once("close", () => {
        closedSocketCount++;

        if (closedSocketCount === requestCount) {
          resolveAllUpstreamSocketsClosed();
        }
      });
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    const clients = Array.from({ length: requestCount }, (_, index) => {
      let resolveReceivedData!: () => void;
      let resolveTerminated!: () => void;

      const receivedData = new Promise<void>((resolve) => {
        resolveReceivedData = resolve;
      });

      const terminated = new Promise<void>((resolve) => {
        resolveTerminated = resolve;
      });

      const req = http.request({
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: `http://127.0.0.1:${upstreamPort}/concurrent-${index}`,
        headers: {
          Host: `127.0.0.1:${upstreamPort}`,
        },
      });

      req.once("response", (res) => {
        res.once("data", resolveReceivedData);
        res.once("close", resolveTerminated);

        res.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ECONNRESET") {
            resolveTerminated();
          }
        });
      });

      req.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNRESET" || err.code === "EPIPE") {
          resolveTerminated();
        }
      });

      req.end();

      return { receivedData, terminated };
    });

    await allRequestsReceived;
    await Promise.all(clients.map((client) => client.receivedData));

    assert.equal(
      ContextManager.getActiveRequests().length,
      activeRequestsBefore + requestCount,
      "Expected all concurrent requests to be active",
    );

    assert.equal(
      upstreamSockets.size,
      requestCount,
      "Expected a separate upstream connection for each concurrent request",
    );

    await proxy.stop(100);

    await Promise.all([
      ...clients.map((client) => client.terminated),
      allUpstreamSocketsClosed,
    ]);

    assert.equal(
      closedSocketCount,
      requestCount,
      "Expected all upstream sockets to close",
    );

    assert.equal(
      ContextManager.getActiveRequests().length,
      activeRequestsBefore,
      "Expected all active request contexts to be removed",
    );
  });
});
