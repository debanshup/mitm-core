import assert from "node:assert/strict";
import fs from "node:fs";
import https from "node:https";
import http from "node:http";

import net from "node:net";
import tls from "node:tls";

import { Proxy } from "../../../src/lib/Proxy";
import { ContextManager } from "../../../src/core/scope/ContextManager";

const CA_CERT = fs.readFileSync("creds/__self__/CA.pem", "utf8");
const CA_KEY = fs.readFileSync("creds/__self__/key.pem", "utf8");

const UPSTREAM_CERT = fs.readFileSync("test/fixtures/certs/upstream-cert.pem");
const UPSTREAM_KEY = fs.readFileSync("test/fixtures/certs/upstream-key.pem");

describe("Proxy Client Disconnect Integration", () => {
  let upstream: http.Server | https.Server;
  let proxy: Proxy;

  let upstreamPort: number;
  let proxyPort: number;

  let upstreamRequestClosed = false;
  let proxyStopped = false;

  beforeEach(async () => {
    proxyStopped = false;
    upstreamRequestClosed = false;

    upstream = http.createServer((req, res) => {
      res.writeHead(200, {
        "content-type": "text/plain",
        "transfer-encoding": "chunked",
      });
      res.flushHeaders();

      res.on("close", () => {
        upstreamRequestClosed = true;
      });

      const interval = setInterval(() => {
        if (!res.destroyed) {
          res.write(".\n");
        } else {
          clearInterval(interval);
        }
      }, 100);
    });

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
      upstreamTimeoutMs: 1000,
    });

    await new Promise<void>((resolve) => {
      proxy.listen(0, resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;
    proxyPort = (proxy.address() as net.AddressInfo).port;
  });

  afterEach(async () => {
    if (!proxyStopped) {
      await proxy.stop();
      proxyStopped = true;
    }

    await new Promise<void>((resolve) => {
      if (!upstream.listening) {
        resolve();
        return;
      }

      upstream.close(() => resolve());
    });
  });

  it("should clean up the upstream request when the client disconnects", async () => {
    const req = http.request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "GET",
      path: `http://127.0.0.1:${upstreamPort}/slow`,
    });

    req.on("error", () => {
      // Expected because we intentionally destroy the client request.
    });

    req.end();

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    req.destroy();

    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });

    assert.equal(upstreamRequestClosed, true);
  });

  it("should clean up the HTTPS upstream request when the client disconnects", async () => {
    await new Promise<void>((resolve) => {
      if (upstream && upstream.listening) {
        upstream.close(() => resolve());
      } else {
        resolve();
      }
    });

    upstream = https.createServer(
      {
        key: UPSTREAM_KEY,
        cert: UPSTREAM_CERT,
      },
      (_req, res) => {
        // Immediately establish connection tracking
        res.writeHead(200, {
          "content-type": "text/plain",
          "transfer-encoding": "chunked",
        });
        res.flushHeaders();

        res.on("close", () => {
          upstreamRequestClosed = true;
        });

        const interval = setInterval(() => {
          if (!res.destroyed) {
            res.write(".\n");
          } else {
            clearInterval(interval);
          }
        }, 100);
      },
    );

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    const connectReq = net.connect(proxyPort, "127.0.0.1");

    connectReq.write(
      [
        `CONNECT localhost:${upstreamPort} HTTP/1.1`,
        `Host: localhost:${upstreamPort}`,
        "Connection: close",
        "",
        "",
      ].join("\r\n"),
    );

    let connectResponse = "";

    await new Promise<void>((resolve, reject) => {
      connectReq.on("data", (chunk) => {
        connectResponse += chunk.toString();

        if (!connectResponse.includes("\r\n\r\n")) {
          return;
        }

        try {
          assert.match(connectResponse, /^HTTP\/1\.1 200/);
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      connectReq.once("error", reject);
    });

    const tlsSocket = tls.connect({
      socket: connectReq,
      servername: "localhost",
      rejectUnauthorized: false,
    });

    await new Promise<void>((resolve, reject) => {
      tlsSocket.once("secureConnect", resolve);
      tlsSocket.once("error", reject);
    });

    tlsSocket.write(
      [
        `GET https://localhost:${upstreamPort}/slow HTTP/1.1`,
        `Host: localhost:${upstreamPort}`,
        "Connection: close",
        "",
        "",
      ].join("\r\n"),
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });

    tlsSocket.destroy();

    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });

    assert.equal(upstreamRequestClosed, true);
  });

  it("should return 504 when the upstream request times out", async function () {
    this.timeout(1500);

    upstream.removeAllListeners("request");

    let upstreamRequestStarted = false;
    let upstreamRequestClosed = false;
    let upstreamSocket: any = null; // Track the socket to force close it later

    upstream.on("request", (_req, res) => {
      upstreamRequestStarted = true;
      upstreamSocket = res.socket; // Store reference to the socket

      res.on("close", () => {
        upstreamRequestClosed = true;
      });

      // Intentionally never respond to simulate a timeout
    });

    const activeRequestsBefore = ContextManager.getActiveRequests().length;

    try {
      const response = await new Promise<{
        statusCode?: number;
        body: string;
      }>((resolve, reject) => {
        const req = http.request(
          {
            host: "localhost",
            port: proxyPort,
            method: "GET",
            path: `http://localhost:${upstreamPort}/timeout`,
          },
          (res) => {
            let body = "";

            res.on("data", (chunk) => {
              body += chunk.toString();
            });

            res.on("end", () => {
              resolve({
                statusCode: res.statusCode,
                body,
              });
            });
          },
        );

        req.on("error", (error) => {
          reject(error);
        });
        req.end();
      });

      assert.equal(upstreamRequestStarted, true);
      assert.equal(response.statusCode, 504);
      assert.match(response.body, /Gateway Timeout/i);

      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 500;

        const check = () => {
          if (upstreamRequestClosed) {
            resolve();
            return;
          }

          if (Date.now() >= deadline) {
            reject(
              new Error("Upstream response socket did not close after timeout"),
            );
            return;
          }

          setTimeout(check, 10);
        };

        check();
      });

      assert.equal(upstreamRequestClosed, true);

      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 1000;

        const check = () => {
          const activeRequests = ContextManager.getActiveRequests().length;

          if (activeRequests <= activeRequestsBefore) {
            resolve();
            return;
          }

          if (Date.now() >= deadline) {
            reject(
              new Error(
                `Timed-out request was not cleaned up. ` +
                  `Active requests before: ${activeRequestsBefore}, ` +
                  `after: ${activeRequests}`,
              ),
            );
            return;
          }

          setTimeout(check, 10);
        };

        check();
      });
    } finally {
      if (upstreamSocket && !upstreamSocket.destroyed) {
        upstreamSocket.destroy();
      }
    }
  });

  it("should close active connections when the proxy stops", async function () {
    upstream.removeAllListeners("request");
    this.timeout(6000);

    proxyStopped = false;

    let upstreamRequestStarted = false;
    let upstreamRequestClosed = false;

    const upstreamStarted = new Promise<void>((resolve) => {
      upstream.on("request", (_req, res) => {
        upstreamRequestStarted = true;

        res.on("close", () => {
          upstreamRequestClosed = true;
        });

        resolve();

        // Intentionally keep the request open.
      });
    });

    const req = http.request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "GET",
      path: `http://127.0.0.1:${upstreamPort}/shutdown`,
    });

    req.on("error", () => {
      // Expected when proxy shuts down.
    });

    req.end();

    await upstreamStarted;

    await proxy.stop();
    proxyStopped = true;

    assert.equal(upstreamRequestStarted, true);

   await new Promise<void>((resolve, reject) => {
     const deadline = Date.now() + 1000;

     const check = () => {
       if (upstreamRequestClosed) {
         resolve();
         return;
       }

       if (Date.now() >= deadline) {
         reject(
           new Error(
             "HTTP upstream request did not close after proxy shutdown",
           ),
         );
         return;
       }

       setTimeout(check, 10);
     };

     check();
   });

   assert.equal(upstreamRequestClosed, true);
  });

  it("should close active HTTPS upstream connections when the proxy stops", async function () {
    this.timeout(6000);

    let upstreamRequestStarted = false;
    let upstreamRequestClosed = false;

    const httpsUpstream = https.createServer(
      {
        key: CA_KEY,
        cert: CA_CERT,
      },
      (_req, res) => {
        upstreamRequestStarted = true;

        res.writeHead(200, {
          "content-type": "text/plain",
          "transfer-encoding": "chunked",
        });

        res.flushHeaders();

        res.on("close", () => {
          upstreamRequestClosed = true;
        });

        const interval = setInterval(() => {
          if (!res.destroyed) {
            res.write(".\n");
          } else {
            clearInterval(interval);
          }
        }, 100);
      },
    );

    await new Promise<void>((resolve) => {
      httpsUpstream.listen(0, "127.0.0.1", resolve);
    });

    const httpsUpstreamPort = (httpsUpstream.address() as net.AddressInfo).port;

    try {
      const upstreamStarted = new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (upstreamRequestStarted) {
            clearInterval(check);
            resolve();
          }
        }, 10);
      });

      const connectReq = http.request({
        host: "127.0.0.1",
        port: proxyPort,
        method: "CONNECT",
        path: `127.0.0.1:${httpsUpstreamPort}`,
      });

      connectReq.on("error", () => {
        // Expected when proxy shuts down.
      });

      connectReq.on("connect", (_res, socket) => {
        const tlsSocket = tls.connect({
          socket,
          servername: "localhost",
          rejectUnauthorized: false,
        });

        tlsSocket.on("error", () => {
          // Expected when proxy shuts down.
        });

        tlsSocket.on("secureConnect", () => {
          tlsSocket.write(
            [
              `GET /shutdown HTTP/1.1`,
              `Host: localhost:${httpsUpstreamPort}`,
              `Connection: keep-alive`,
              ``,
              ``,
            ].join("\r\n"),
          );
        });
      });

      connectReq.end();

      await upstreamStarted;

      assert.equal(upstreamRequestStarted, true);

      await proxy.stop();
      proxyStopped = true;

      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 1000;

        const check = () => {
          if (upstreamRequestClosed) {
            resolve();
            return;
          }

          if (Date.now() >= deadline) {
            reject(
              new Error(
                "HTTPS upstream request did not close after proxy shutdown",
              ),
            );
            return;
          }

          setTimeout(check, 10);
        };

        check();
      });

      assert.equal(upstreamRequestClosed, true);
    } finally {
      await new Promise<void>((resolve) => {
        if (!httpsUpstream.listening) {
          resolve();
          return;
        }

        httpsUpstream.close(() => resolve());
      });
    }
  });

  it("should share the same shutdown operation across concurrent stop calls", async function () {
    this.timeout(6000);

    const firstStop = proxy.stop();
    const secondStop = proxy.stop();
    const thirdStop = proxy.stop();

    assert.strictEqual(
      firstStop,
      secondStop,
      "Concurrent stop calls should return the same promise",
    );

    assert.strictEqual(
      secondStop,
      thirdStop,
      "All concurrent stop calls should share the same promise",
    );

    await Promise.all([firstStop, secondStop, thirdStop]);

    proxyStopped = true;
  });

  it("should force-close active requests when the shutdown deadline expires", async function () {
    this.timeout(5000);

    upstream.removeAllListeners("request");

    let upstreamRequestStarted = false;
    let upstreamRequestClosed = false;

    upstream.on("request", (_req, res) => {
      upstreamRequestStarted = true;

      res.on("close", () => {
        upstreamRequestClosed = true;
      });

      // Deliberately never respond.
    });

    const req = http.request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "GET",
      path: `http://127.0.0.1:${upstreamPort}/forced-shutdown`,
    });

    req.on("error", () => {
      // Expected when shutdown destroys the downstream connection.
    });

    req.end();

    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 1000;

      const check = () => {
        if (upstreamRequestStarted) {
          resolve();
          return;
        }

        if (Date.now() >= deadline) {
          reject(new Error("Upstream request did not start"));
          return;
        }

        setTimeout(check, 10);
      };

      check();
    });

    const activeRequestsBefore = ContextManager.getActiveRequests().length;
    assert.ok(
      activeRequestsBefore > 0,
      "Expected an active request before shutdown",
    );

    await proxy.stop(300);
    proxyStopped = true;

    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 1000;

      const check = () => {
        const activeRequests = ContextManager.getActiveRequests().length;

        if (upstreamRequestClosed && activeRequests <= activeRequestsBefore) {
          resolve();
          return;
        }

        if (Date.now() >= deadline) {
          reject(
            new Error(
              `Client disconnect cleanup incomplete: ` +
                `upstreamClosed=${upstreamRequestClosed}, ` +
                `activeRequestsBefore=${activeRequestsBefore}, ` +
                `activeRequests=${activeRequests}`,
            ),
          );
          return;
        }

        setTimeout(check, 10);
      };

      check();
    });

    assert.equal(upstreamRequestClosed, true);
    assert.equal(ContextManager.getActiveRequests().length, 0);
  });
});
