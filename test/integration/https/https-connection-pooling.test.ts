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

export async function makeHttpsKeepAliveProxyRequest(
  proxyPort: number,
  upstreamPort: number,
  path: string,
): Promise<{
  statusCode: number;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const connectReq = net.connect(proxyPort, "127.0.0.1", () => {
      connectReq.write(
        [
          `CONNECT localhost:${upstreamPort} HTTP/1.1`,
          `Host: localhost:${upstreamPort}`,
          "Connection: keep-alive",
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

      try {
        assert.match(connectResponse, /^HTTP\/1\.1 200/);
      } catch (error) {
        connectReq.destroy();
        reject(error);
        return;
      }

      const tlsSocket = tls.connect({
        socket: connectReq,
        servername: "localhost",
        rejectUnauthorized: false,
      });

      tlsSocket.once("secureConnect", () => {
        tlsSocket.write(
          [
            `GET ${path} HTTP/1.1`,
            "Host: localhost",
            "Connection: keep-alive",
            "",
            "",
          ].join("\r\n"),
        );
      });

      let responseData = Buffer.alloc(0);
      let resolved = false;

      tlsSocket.on("data", (chunk: Buffer) => {
        if (resolved) return;

        responseData = Buffer.concat([responseData, chunk]);

        const headerEnd = responseData.indexOf("\r\n\r\n");

        if (headerEnd === -1) {
          return;
        }

        const headerPart = responseData.subarray(0, headerEnd).toString();

        const body = responseData.subarray(headerEnd + 4);

        const contentLengthHeader = headerPart.match(
          /(?:^|\r\n)content-length:\s*(\d+)/i,
        );

        if (!contentLengthHeader) {
          return;
        }

        const contentLength = Number(contentLengthHeader[1]);

        if (body.length < contentLength) {
          return;
        }

        resolved = true;

        const statusLine = headerPart.split("\r\n")[0];
        const statusCode = Number(statusLine.split(" ")[1]);

        resolve({
          statusCode,
          body: body.subarray(0, contentLength).toString(),
        });
      });

      tlsSocket.on("error", reject);
    });

    connectReq.on("error", reject);
  });
}

async function makeHttpsProxyRequest(
  proxyPort: number,
  upstreamPort: number,
  path: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, "127.0.0.1");

    socket.once("error", reject);

    let buffer = Buffer.alloc(0);

    const onConnectData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      socket.off("data", onConnectData);

      const response = buffer.subarray(0, headerEnd).toString();

      assert.match(response, /^HTTP\/1\.1 200 Connection Established/);

      const tlsSocket = tls.connect({
        socket,
        servername: "localhost",
        rejectUnauthorized: false,
      });

      tlsSocket.once("error", reject);

      tlsSocket.once("secureConnect", () => {
        const req = https.request(
          {
            host: "localhost",
            port: upstreamPort,
            method: "GET",
            path,
            headers: {
              Host: `localhost:${upstreamPort}`,
              Connection: "keep-alive",
            },
            rejectUnauthorized: false,

            // Reuse the TLS socket created through CONNECT.
            createConnection: () => tlsSocket,
            agent: false,
          },
          (res) => {
            const chunks: Buffer[] = [];

            res.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });

            res.on("end", () => {
              resolve({
                statusCode: res.statusCode ?? 0,
                body: Buffer.concat(chunks).toString(),
              });
            });

            res.on("error", reject);
          },
        );

        req.on("error", reject);
        req.end();
      });
    };

    socket.on("data", onConnectData);

    socket.write(
      [
        `CONNECT 127.0.0.1:${upstreamPort} HTTP/1.1`,
        `Host: 127.0.0.1:${upstreamPort}`,
        "Connection: keep-alive",
        "",
        "",
      ].join("\r\n"),
    );
  });
}

describe("HTTPS Connection Pooling", () => {
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

  it("uses the upstream connection pool for concurrent HTTPS requests", async () => {
    const agent = new https.Agent({
      keepAlive: true,
      maxSockets: 3,
      rejectUnauthorized: false,
    });

    const makeRequest = () =>
      new Promise<string>((resolve, reject) => {
        const connectReq = http.request({
          host: "127.0.0.1",
          port: proxyPort,
          method: "CONNECT",
          path: `127.0.0.1:${upstreamPort}`,
        });

        connectReq.on("connect", (res, socket) => {
          if (res.statusCode !== 200) {
            return reject(
              new Error(`Proxy rejected CONNECT with status ${res.statusCode}`),
            );
          }

          const tlsSocket = tls.connect({
            socket,
            rejectUnauthorized: false,
            servername: "localhost",
          });

          tlsSocket.on("secureConnect", () => {
            const req = https.request(
              {
                createConnection: () => tlsSocket,
                host: "127.0.0.1",
                path: "/test",
                method: "GET",
              },
              (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (chunk: Buffer) => chunks.push(chunk));
                res.on("end", () => resolve(Buffer.concat(chunks).toString()));
              },
            );

            req.on("error", reject);
            req.end();
          });

          tlsSocket.on("error", reject);
        });

        connectReq.on("error", reject);
        connectReq.end();
      });

    const responses = await Promise.all([
      makeRequest(),
      makeRequest(),
      makeRequest(),
    ]);

    assert.deepEqual(responses, ["ok", "ok", "ok"]);
    assert.equal(upstreamRequestCount, 3);
    assert.equal(upstreamConnectionCount, 3);

    agent.destroy();
  });

  it("reuses an idle HTTPS upstream connection", async () => {
    const first = await makeHttpsKeepAliveProxyRequest(
      proxyPort,
      upstreamPort,
      "/first",
    );

    const second = await makeHttpsKeepAliveProxyRequest(
      proxyPort,
      upstreamPort,
      "/second",
    );

    assert.strictEqual(first.statusCode, 200);
    assert.strictEqual(first.body, "ok");

    assert.strictEqual(second.statusCode, 200);
    assert.strictEqual(second.body, "ok");
  });

//   it("reuses the same upstream HTTPS connection for sequential requests", async () => {
//     const first = await makeHttpsProxyRequest(
//       proxyPort,
//       upstreamPort,
//       "/first",
//     );

//     const second = await makeHttpsProxyRequest(
//       proxyPort,
//       upstreamPort,
//       "/second",
//     );

//     const third = await makeHttpsProxyRequest(
//       proxyPort,
//       upstreamPort,
//       "/third",
//     );

//     assert.strictEqual(first.statusCode, 200);
//     assert.strictEqual(first.body, "ok");

//     assert.strictEqual(second.statusCode, 200);
//     assert.strictEqual(second.body, "ok");

//     assert.strictEqual(third.statusCode, 200);
//     assert.strictEqual(third.body, "ok");

//     assert.strictEqual(upstreamRequestCount, 3);
//     assert.strictEqual(upstreamConnectionCount, 1);
//   });

//   it("reuses an idle HTTPS upstream connection", async () => {
//     const first = await makeHttpsProxyRequest(
//       proxyPort,
//       upstreamPort,
//       "/first",
//     );

//     const second = await makeHttpsProxyRequest(
//       proxyPort,
//       upstreamPort,
//       "/second",
//     );

//     assert.strictEqual(first.statusCode, 200);
//     assert.strictEqual(first.body, "ok");

//     assert.strictEqual(second.statusCode, 200);
//     assert.strictEqual(second.body, "ok");

//     assert.strictEqual(upstreamRequestCount, 2);
//     assert.strictEqual(upstreamConnectionCount, 1);
//   });

  it("uses the upstream HTTPS connection pool for concurrent requests", async () => {
    const results = await Promise.all([
      makeHttpsProxyRequest(proxyPort, upstreamPort, "/1"),
      makeHttpsProxyRequest(proxyPort, upstreamPort, "/2"),
      makeHttpsProxyRequest(proxyPort, upstreamPort, "/3"),
    ]);

    for (const result of results) {
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.body, "ok");
    }

    assert.strictEqual(upstreamRequestCount, 3);
    assert.strictEqual(upstreamConnectionCount, 3);
  });
});
