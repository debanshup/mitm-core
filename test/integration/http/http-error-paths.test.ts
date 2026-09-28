import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import net from "node:net";

import { Proxy } from "../../../src/lib/Proxy";

const CA_CERT = fs.readFileSync("creds/__self__/CA.pem", "utf8");

const CA_KEY = fs.readFileSync("creds/__self__/key.pem", "utf8");

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

  it("destroys the upstream request when the client disconnects", async () => {
    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    let upstreamSocket: net.Socket | undefined;

    const upstreamConnected = new Promise<void>((resolve) => {
      upstream = http.createServer((_req, res) => {
        res.writeHead(200, {
          connection: "keep-alive",
        });

        res.write("waiting");

        // Intentionally keep this response open.
        res.socket?.once("close", () => {
          upstreamSocket = undefined;
        });
      });

      upstream.on("connection", (socket) => {
        upstreamSocket = socket;
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    const req = http.request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "GET",
      path: `http://127.0.0.1:${upstreamPort}/disconnect`,
      headers: {
        Host: `127.0.0.1:${upstreamPort}`,
        Connection: "keep-alive",
      },
    });

    req.end();

    await upstreamConnected;

    // Give the proxy request a chance to settle.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Simulate the client disappearing.
    req.destroy();

    // Wait for proxy cleanup.
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.ok(
      !upstreamSocket || upstreamSocket.destroyed,
      "Expected proxy to destroy the upstream socket",
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
});
