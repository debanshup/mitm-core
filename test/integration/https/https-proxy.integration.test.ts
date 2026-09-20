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
});
