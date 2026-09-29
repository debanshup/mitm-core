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

describe("HTTPS Proxy Integration", () => {
  let upstream: https.Server;
  let proxy: Proxy;

  let upstreamPort: number;
  let proxyPort: number;

  beforeEach(async () => {
    upstream = https.createServer(
      {
        key: UPSTREAM_KEY,
        cert: UPSTREAM_CERT,
      },
      (_req, res) => {
        const body = "hello from https upstream";

        res.writeHead(200, {
          "content-type": "text/plain",
          "content-length": Buffer.byteLength(body),
          connection: "close",
        });

        res.end(body);
      },
    );

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
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

  it("should proxy an HTTPS GET request through CONNECT", async () => {
    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const connectReq = net.connect(proxyPort, "127.0.0.1", () => {
        connectReq.write(
          [
            `CONNECT localhost:${upstreamPort} HTTP/1.1`,
            `Host: localhost:${upstreamPort}`,
            "Connection: close",
            "",
            "",
          ].join("\r\n"),
        );
      });

      let connectResponse = "";

      connectReq.on("data", (chunk) => {
        connectResponse += chunk.toString();
        if (!connectResponse.includes("\r\n\r\n")) {
          return;
        }

        assert.match(connectResponse, /^HTTP\/1\.1 200/);

        const tlsSocket = tls.connect({
          socket: connectReq,
          servername: "localhost",
          rejectUnauthorized: false,
        });

        tlsSocket.once("secureConnect", () => {
          tlsSocket.write(
            [
              "GET /hello HTTP/1.1",
              "Host: localhost",
              "Connection: close",
              "",
              "",
            ].join("\r\n"),
          );
        });

        let responseData = "";

        tlsSocket.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        tlsSocket.on("end", () => {
          const [headerPart, body = ""] = responseData.split("\r\n\r\n", 2);

          const statusLine = headerPart.split("\r\n")[0];

          const statusCode = Number(statusLine.split(" ")[1]);

          resolve({
            statusCode,
            body,
          });
        });

        tlsSocket.on("error", reject);
      });

      connectReq.on("error", reject);
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "hello from https upstream");
  });

  it("should proxy HTTPS request headers to the upstream server", async () => {
    upstream.removeAllListeners("request");

    upstream.on("request", (req, res) => {
      const body = JSON.stringify({
        "x-test-header": req.headers["x-test-header"],
        "user-agent": req.headers["user-agent"],
      });

      res.writeHead(200, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        connection: "close",
      });

      res.end(body);
    });

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const connectReq = net.connect(proxyPort, "127.0.0.1", () => {
        connectReq.write(
          [
            `CONNECT localhost:${upstreamPort} HTTP/1.1`,
            `Host: localhost:${upstreamPort}`,
            "Connection: close",
            "",
            "",
          ].join("\r\n"),
        );
      });

      let connectResponse = "";

      connectReq.on("data", (chunk) => {
        connectResponse += chunk.toString();

        if (!connectResponse.includes("\r\n\r\n")) {
          return;
        }

        assert.match(connectResponse, /^HTTP\/1\.1 200/);

        const tlsSocket = tls.connect({
          socket: connectReq,
          servername: "localhost",
          rejectUnauthorized: false,
        });

        tlsSocket.once("secureConnect", () => {
          tlsSocket.write(
            [
              "GET /headers HTTP/1.1",
              "Host: localhost",
              "X-Test-Header: mitm-core-https-test",
              "User-Agent: mitm-core-integration-test",
              "Connection: close",
              "",
              "",
            ].join("\r\n"),
          );
        });

        let responseData = "";

        tlsSocket.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        tlsSocket.on("end", () => {
          const [headerPart, body = ""] = responseData.split("\r\n\r\n", 2);

          const statusLine = headerPart.split("\r\n")[0];
          const statusCode = Number(statusLine.split(" ")[1]);

          resolve({
            statusCode,
            body,
          });
        });

        tlsSocket.on("error", reject);
      });

      connectReq.on("error", reject);
    });

    assert.equal(response.statusCode, 200);

    const headers = JSON.parse(response.body);

    assert.equal(headers["x-test-header"], "mitm-core-https-test");

    assert.equal(headers["user-agent"], "mitm-core-integration-test");
  });

  it("should proxy a POST request with body to the upstream server", async () => {
    upstream.removeAllListeners("request");

    upstream.on("request", (req, res) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
      });

      req.on("end", () => {
        const body = Buffer.concat(chunks).toString();

        res.writeHead(200, {
          "content-type": "text/plain",
          "content-length": Buffer.byteLength(body),
          connection: "close",
        });

        res.end(body);
      });
    });

    const body = JSON.stringify({
      name: "mitm-core",
      protocol: "https",
    });

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const connectReq = net.connect(proxyPort, "127.0.0.1", () => {
        connectReq.write(
          [
            `CONNECT localhost:${upstreamPort} HTTP/1.1`,
            `Host: localhost:${upstreamPort}`,
            "Connection: close",
            "",
            "",
          ].join("\r\n"),
        );
      });

      let connectResponse = "";

      connectReq.on("data", (chunk) => {
        connectResponse += chunk.toString();

        if (!connectResponse.includes("\r\n\r\n")) {
          return;
        }

        assert.match(connectResponse, /^HTTP\/1\.1 200/);

        const tlsSocket = tls.connect({
          socket: connectReq,
          servername: "localhost",
          rejectUnauthorized: false,
        });

        tlsSocket.once("secureConnect", () => {
          tlsSocket.write(
            [
              "POST /data HTTP/1.1",
              "Host: localhost",
              "Content-Type: application/json",
              `Content-Length: ${Buffer.byteLength(body)}`,
              "Connection: close",
              "",
              body,
            ].join("\r\n"),
          );
        });

        let responseData = "";

        tlsSocket.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        tlsSocket.on("end", () => {
          const [headerPart, body = ""] = responseData.split("\r\n\r\n", 2);

          const statusLine = headerPart.split("\r\n")[0];
          const statusCode = Number(statusLine.split(" ")[1]);

          resolve({
            statusCode,
            body,
          });
        });

        tlsSocket.on("error", reject);
      });

      connectReq.on("error", reject);
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, body);
  });

  it("should forward an HTTPS upstream 404 response", async () => {
    upstream.removeAllListeners("request");

    upstream.on("request", (_req, res) => {
      const body = "https resource not found";

      res.writeHead(404, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(body),
        connection: "close",
      });

      res.end(body);
    });

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const connectReq = net.connect(proxyPort, "127.0.0.1", () => {
        connectReq.write(
          [
            `CONNECT localhost:${upstreamPort} HTTP/1.1`,
            `Host: localhost:${upstreamPort}`,
            "Connection: close",
            "",
            "",
          ].join("\r\n"),
        );
      });

      let connectResponse = "";

      connectReq.on("data", (chunk) => {
        connectResponse += chunk.toString();

        if (!connectResponse.includes("\r\n\r\n")) {
          return;
        }

        assert.match(connectResponse, /^HTTP\/1\.1 200/);

        const tlsSocket = tls.connect({
          socket: connectReq,
          servername: "localhost",
          rejectUnauthorized: false,
        });

        tlsSocket.once("secureConnect", () => {
          tlsSocket.write(
            [
              "GET /missing HTTP/1.1",
              "Host: localhost",
              "X-Test-Header: mitm-core-https-test",
              "User-Agent: mitm-core-integration-test",
              "Connection: close",
              "",
              "",
            ].join("\r\n"),
          );
        });

        let responseData = "";

        tlsSocket.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        tlsSocket.on("end", () => {
          const [headerPart, body = ""] = responseData.split("\r\n\r\n", 2);

          const statusLine = headerPart.split("\r\n")[0];
          const statusCode = Number(statusLine.split(" ")[1]);

          resolve({
            statusCode,
            body,
          });
        });

        tlsSocket.on("error", reject);
      });

      connectReq.on("error", reject);
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body, "https resource not found");
  });

  it("should forward an HTTPS upstream 500 response", async () => {
    upstream.removeAllListeners("request");

    upstream.on("request", (_req, res) => {
      const body = "https internal server error";

      res.writeHead(500, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(body),
        connection: "close",
      });

      res.end(body);
    });

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const connectReq = net.connect(proxyPort, "127.0.0.1", () => {
        connectReq.write(
          [
            `CONNECT localhost:${upstreamPort} HTTP/1.1`,
            `Host: localhost:${upstreamPort}`,
            "Connection: close",
            "",
            "",
          ].join("\r\n"),
        );
      });

      let connectResponse = "";

      connectReq.on("data", (chunk) => {
        connectResponse += chunk.toString();

        if (!connectResponse.includes("\r\n\r\n")) {
          return;
        }

        assert.match(connectResponse, /^HTTP\/1\.1 200/);

        const tlsSocket = tls.connect({
          socket: connectReq,
          servername: "localhost",
          rejectUnauthorized: false,
        });

        tlsSocket.once("secureConnect", () => {
          tlsSocket.write(
            [
              "GET /missing HTTP/1.1",
              "Host: localhost",
              "X-Test-Header: mitm-core-https-test",
              "User-Agent: mitm-core-integration-test",
              "Connection: close",
              "",
              "",
            ].join("\r\n"),
          );
        });

        let responseData = "";

        tlsSocket.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        tlsSocket.on("end", () => {
          const [headerPart, body = ""] = responseData.split("\r\n\r\n", 2);

          const statusLine = headerPart.split("\r\n")[0];
          const statusCode = Number(statusLine.split(" ")[1]);

          resolve({
            statusCode,
            body,
          });
        });

        tlsSocket.on("error", reject);
      });

      connectReq.on("error", reject);
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.body, "https internal server error");
  });

  it("should return 502 when the HTTPS upstream connection fails", async () => {
    const deadServer = net.createServer();

    const unavailablePort = await new Promise<number>((resolve, reject) => {
      deadServer.listen(0, "127.0.0.1", () => {
        const address = deadServer.address();

        if (!address || typeof address === "string") {
          reject(new Error("Failed to determine unused port"));
          return;
        }

        const port = address.port;

        deadServer.close((err) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(port);
        });
      });

      deadServer.on("error", reject);
    });

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const connectReq = net.connect(proxyPort, "127.0.0.1", () => {
        connectReq.write(
          [
            `CONNECT localhost:${unavailablePort} HTTP/1.1`,
            `Host: localhost:${unavailablePort}`,
            "Connection: close",
            "",
            "",
          ].join("\r\n"),
        );
      });

      let connectResponse = "";
      let tlsStarted = false;

      connectReq.on("data", (chunk) => {
        connectResponse += chunk.toString();

        if (tlsStarted || !connectResponse.includes("\r\n\r\n")) {
          return;
        }

        tlsStarted = true;

        assert.match(connectResponse, /^HTTP\/1\.1 200/);

        const tlsSocket = tls.connect({
          socket: connectReq,
          servername: "localhost",
          rejectUnauthorized: false,
        });

        tlsSocket.once("secureConnect", () => {
          tlsSocket.write(
            [
              "GET /hello HTTP/1.1",
              "Host: localhost",
              "Connection: close",
              "",
              "",
            ].join("\r\n"),
          );
        });

        let responseData = "";

        tlsSocket.on("data", (chunk) => {
          responseData += chunk.toString();
        });

        tlsSocket.on("end", () => {
          const [headerPart, body = ""] = responseData.split("\r\n\r\n", 2);

          const statusLine = headerPart.split("\r\n")[0];

          const statusCode = Number(statusLine.split(" ")[1]);

          resolve({
            statusCode,
            body,
          });
        });

        tlsSocket.on("error", reject);
      });

      connectReq.on("error", reject);
    });

    assert.equal(response.statusCode, 502);
  });

  it("should stream a large HTTPS response without truncation", async function () {
    this.timeout(10000);

    const SIZE = 10 * 1024 * 1024;
    const payload = Buffer.alloc(SIZE, "c");

    const largeUpstream = https.createServer(
      {
        key: UPSTREAM_KEY,
        cert: UPSTREAM_CERT,
      },
      (req, res) => {
        req.socket?.setNoDelay(true);
        res.writeHead(200, {
          "content-type": "application/octet-stream",
          "content-length": payload.length,
        });
        res.end(payload);
      },
    );

    await new Promise<void>((resolve) => {
      largeUpstream.listen(0, "127.0.0.1", resolve);
    });

    const port = (largeUpstream.address() as net.AddressInfo).port;

    try {
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        const connectReq = http.request({
          host: "127.0.0.1",
          port: proxyPort,
          method: "CONNECT",
          path: `127.0.0.1:${port}`,
        });

        connectReq.once("error", reject);

        connectReq.once("connect", (_res, socket) => {
          socket.setNoDelay(true);
          const tlsSocket = tls.connect({
            socket,
            servername: "localhost",
            rejectUnauthorized: false,
          });

          tlsSocket.once("error", reject);

          tlsSocket.once("secureConnect", () => {
            tlsSocket.write(
              [
                "GET /large HTTP/1.1",
                `Host: localhost:${port}`,
                "Connection: close",
                "",
                "",
              ].join("\r\n"),
            );
          });

          tlsSocket.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
          });

          tlsSocket.once("end", resolve);
        });

        connectReq.end();
      });

      const received = Buffer.concat(chunks);

      // Separate HTTP headers from the response body.
      const headerEnd = received.indexOf(Buffer.from("\r\n\r\n"));

      assert.notEqual(headerEnd, -1);

      const body = received.subarray(headerEnd + 4);

      assert.equal(body.length, SIZE);
      assert.equal(body.equals(payload), true);
    } finally {
      await new Promise<void>((resolve) => {
        largeUpstream.close(() => resolve());
      });
    }
  });

  it("should stream a large HTTPS request body without truncation", async function () {
    this.timeout(10000);

    const SIZE = 10 * 1024 * 1024;
    const payload = Buffer.alloc(SIZE, "d");

    let receivedBytes = 0;
    let requestEnded = false;
    let upstreamRequestCount = 0;

    const testUpstream = https.createServer(
      {
        key: UPSTREAM_KEY,
        cert: UPSTREAM_CERT,
      },
      (req, res) => {
        upstreamRequestCount++;
        const requestNumber = upstreamRequestCount;
        const chunks: Buffer[] = [];
        // SINGLE 'data' listener to prevent double-counting bytes
        req.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          chunks.push(chunk);
        });

        // SINGLE 'end' listener to process and respond exactly once
        req.on("end", () => {
          requestEnded = true;

          const received = Buffer.concat(chunks);

          // Assert inside the request cycle
          assert.strictEqual(received.length, SIZE);
          assert.strictEqual(received.equals(payload), true);

          const responseBody = JSON.stringify({
            length: received.length,
            matches: received.equals(payload),
          });

          res.writeHead(200, {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(responseBody),
            connection: "close",
          });

          res.end(responseBody);
        });

        req.on("error", (err) => {
          console.error(`[TEST] Upstream request error:`, err);
        });
      },
    );

    await new Promise<void>((resolve) => {
      testUpstream.listen(0, "127.0.0.1", resolve);
    });

    const port = (testUpstream.address() as net.AddressInfo).port;

    try {
      await new Promise<void>((resolve, reject) => {
        const connectReq = http.request({
          host: "127.0.0.1",
          port: proxyPort, // Uses proxy from beforeEach
          method: "CONNECT",
          path: `127.0.0.1:${port}`,
        });

        connectReq.once("error", reject);

        connectReq.once("connect", (_res, socket) => {
          const tlsSocket = tls.connect({
            socket,
            servername: "localhost",
            rejectUnauthorized: false,
          });

          const responseChunks: Buffer[] = [];

          tlsSocket.on("data", (chunk: Buffer) => {
            responseChunks.push(chunk);
          });

          tlsSocket.once("error", reject);

          tlsSocket.once("end", () => {
            resolve();
          });

          tlsSocket.once("secureConnect", () => {
            tlsSocket.write(
              [
                "POST /large HTTP/1.1",
                `Host: localhost:${port}`,
                "Content-Type: application/octet-stream",
                `Content-Length: ${SIZE}`,
                "Connection: close",
                "",
                "",
              ].join("\r\n"),
            );

            const CHUNK_SIZE = 64 * 1024;
            let offset = 0;

            const writeChunk = () => {
              while (offset < payload.length) {
                const end = Math.min(offset + CHUNK_SIZE, payload.length);
                const canContinue = tlsSocket.write(
                  payload.subarray(offset, end),
                );
                offset = end;

                if (!canContinue) {
                  tlsSocket.once("drain", writeChunk);
                  return;
                }
              }
              tlsSocket.end();
            };

            writeChunk();
          });
        });

        connectReq.end();
      });

      // Verify overall test tracking metrics
      assert.strictEqual(receivedBytes, SIZE);
      assert.strictEqual(requestEnded, true);
    } finally {
      await new Promise<void>((resolve) => {
        if (!testUpstream.listening) {
          resolve();
          return;
        }
        testUpstream.close(() => resolve());
      });
    }
  });
});
