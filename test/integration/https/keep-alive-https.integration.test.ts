import fs from "node:fs";
import https from "node:https";
import tls from "node:tls";

import net from "node:net";
import { Proxy } from "../../../src/lib/Proxy";
import assert from "node:assert";

const CA_CERT = fs.readFileSync("creds/__self__/CA.pem", "utf8");
const CA_KEY = fs.readFileSync("creds/__self__/key.pem", "utf8");

const UPSTREAM_CERT = fs.readFileSync("test/fixtures/certs/upstream-cert.pem");
const UPSTREAM_KEY = fs.readFileSync("test/fixtures/certs/upstream-key.pem");

describe("HTTPS Keep-Alive / Connection Reuse", () => {
  let upstream: https.Server;
  let proxy: Proxy;

  let upstreamPort: number;
  let proxyPort: number;

  let upstreamConnectionCount = 0;
  let upstreamRequestCount = 0;

  beforeEach(async () => {
    upstreamConnectionCount = 0;
    upstreamRequestCount = 0;

    upstream = https.createServer(
      {
        key: UPSTREAM_KEY,
        cert: UPSTREAM_CERT,
      },
      (req, res) => {
        upstreamRequestCount++;

        res.writeHead(200, {
          "content-type": "text/plain",
          "content-length": "2",
          connection: "keep-alive",
        });

        res.end("ok");
      },
    );

    upstream.on("connection", () => {
      upstreamConnectionCount++;
    });

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

  it("reuses the same upstream connection for sequential HTTPS requests", async () => {
    let upstreamConnectionCount = 0;
    let upstreamRequestCount = 0;
    const upstream = https.createServer(
      { key: UPSTREAM_KEY, cert: UPSTREAM_CERT },
      (req, res) => {
        upstreamRequestCount++;
        res.writeHead(200, {
          "content-type": "text/plain",
          "content-length": "2",
          connection: "keep-alive",
        });
        res.end("ok");
      },
    );
    upstream.on("connection", () => {
      upstreamConnectionCount++;
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });
    const upstreamPort = (upstream.address() as net.AddressInfo).port;
    const connect = await new Promise<net.Socket>((resolve, reject) => {
      const socket = net.connect(proxyPort, "127.0.0.1", () => {
        socket.write(
          `CONNECT 127.0.0.1:${upstreamPort} HTTP/1.1\r\n` +
            `Host: 127.0.0.1:${upstreamPort}\r\n` +
            `Connection: keep-alive\r\n\r\n`,
        );
      });
      let response = "";
      socket.on("data", (chunk) => {
        response += chunk.toString();
        if (response.includes("\r\n\r\n")) {
          if (!response.startsWith("HTTP/1.1 200")) {
            reject(new Error(`CONNECT failed: ${response}`));
            return;
          }
          resolve(socket);
        }
      });
      socket.on("error", reject);
    });
    const tlsSocket = tls.connect({
      socket: connect,
      servername: "localhost",
      rejectUnauthorized: false,
    });
    await new Promise<void>((resolve, reject) => {
      tlsSocket.once("secureConnect", resolve);
      tlsSocket.once("error", reject);
    });
    const makeRequest = () =>
      new Promise<string>((resolve, reject) => {
        const responseChunks: Buffer[] = [];
        const request =
          `GET /test HTTP/1.1\r\n` +
          `Host: localhost:${upstreamPort}\r\n` +
          `Connection: keep-alive\r\n\r\n`;
        const onData = (chunk: Buffer) => {
          responseChunks.push(chunk);
          const response = Buffer.concat(responseChunks);
          if (
            response.includes(Buffer.from("\r\n\r\n")) &&
            response.toString().endsWith("ok")
          ) {
            tlsSocket.removeListener("data", onData);
            resolve("ok");
          }
        };
        tlsSocket.on("data", onData);
        tlsSocket.once("error", reject);
        tlsSocket.write(request);
      });
    assert.equal(await makeRequest(), "ok");
    assert.equal(await makeRequest(), "ok");
    assert.equal(await makeRequest(), "ok");
    assert.equal(upstreamRequestCount, 3);
    assert.equal(upstreamConnectionCount, 1);
    tlsSocket.destroy();
    await new Promise<void>((resolve) => {
      if (!upstream.listening) {
        resolve();
        return;
      }
      upstream.close(() => resolve());
    });
  });
});
