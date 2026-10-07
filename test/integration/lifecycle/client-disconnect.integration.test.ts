import assert from "node:assert/strict";
import fs from "node:fs";
import https from "node:https";
import http from "node:http";

import net from "node:net";
import tls from "node:tls";

import { Proxy } from "../../../src/lib/Proxy";

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

      await new Promise<void>((resolve) => {
        if (upstreamRequestClosed) {
          resolve();
          return;
        }

        const interval = setInterval(() => {
          if (upstreamRequestClosed) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      assert.equal(upstreamRequestClosed, true);
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

    // Give socket cleanup a chance to propagate.
    await new Promise((resolve) => setTimeout(resolve, 100));

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

      await new Promise((resolve) => setTimeout(resolve, 100));

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
});
