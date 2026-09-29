import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import net from "node:net";
import https from "node:https";
import tls from "node:tls";
import { Proxy } from "../../../src/lib/Proxy";

const CA_CERT = fs.readFileSync("creds/__self__/CA.pem", "utf8");

const CA_KEY = fs.readFileSync("creds/__self__/key.pem", "utf8");

describe("Proxy Stress Integration", function () {
  this.timeout(15_000);

  let upstream: http.Server;
  let proxy: Proxy;

  let upstreamPort: number;
  let proxyPort: number;

  beforeEach(async () => {
    upstream = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");

      const id = url.searchParams.get("id");

      const body = `stress-response-${id}`;

      res.writeHead(200, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(body),
        connection: "keep-alive",
      });

      res.end(body);
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

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

  const makeHttpRequest = (id: number): Promise<void> =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: proxyPort,
          method: "GET",
          path: `http://127.0.0.1:${upstreamPort}` + `/stress?id=${id}`,
          headers: {
            Host: `127.0.0.1:${upstreamPort}`,
            Connection: "keep-alive",
          },
          agent: false,
        },
        (res) => {
          const chunks: Buffer[] = [];

          res.on("data", (chunk) => {
            chunks.push(chunk);
          });

          res.once("error", reject);

          res.once("end", () => {
            try {
              const body = Buffer.concat(chunks).toString();

              assert.equal(res.statusCode, 200);
              assert.equal(body, `stress-response-${id}`);

              resolve();
            } catch (error) {
              reject(error);
            }
          });
        },
      );

      req.once("error", reject);
      req.end();
    });

  it("handles sustained concurrent HTTP traffic without corruption", async () => {
    const concurrency = 100;
    const rounds = 10;

    const agent = new http.Agent({
      keepAlive: true,
      maxSockets: concurrency,
      maxFreeSockets: concurrency,
    });

    const makeRequest = (id: number): Promise<void> =>
      new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port: proxyPort,
            method: "GET",
            path: `http://127.0.0.1:${upstreamPort}` + `/stress?id=${id}`,
            headers: {
              Host: `127.0.0.1:${upstreamPort}`,
              Connection: "keep-alive",
            },
            agent,
          },
          (res) => {
            const chunks: Buffer[] = [];

            res.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });

            res.once("error", reject);

            res.once("end", () => {
              try {
                const body = Buffer.concat(chunks).toString();

                assert.equal(res.statusCode, 200);
                assert.equal(body, `stress-response-${id}`);

                resolve();
              } catch (error) {
                reject(error);
              }
            });
          },
        );

        req.once("error", reject);
        req.end();
      });

    try {
      for (let round = 0; round < rounds; round++) {
        const requests = Array.from({ length: concurrency }, (_, index) =>
          makeRequest(round * concurrency + index),
        );

        await Promise.all(requests);
      }
    } finally {
      agent.destroy();
    }
  });

  it("handles sustained concurrent HTTP traffic without corruption", async () => {
    const rounds = 10;
    const concurrency = 100;

    for (let round = 0; round < rounds; round++) {
      const requests = Array.from({ length: concurrency }, (_, index) =>
        makeHttpRequest(round * concurrency + index),
      );

      await Promise.all(requests);
    }
  });

  describe("mixed protocol stress", () => {
    let httpsUpstream: https.Server;
    let httpsPort: number;

    beforeEach(async () => {
      httpsUpstream = https.createServer(
        {
          key: CA_KEY,
          cert: CA_CERT,
        },
        (req, res) => {
          const url = new URL(req.url ?? "/", "https://localhost");

          const id = url.searchParams.get("id");
          const body = `https-stress-response-${id}`;

          res.writeHead(200, {
            "content-type": "text/plain",
            "content-length": Buffer.byteLength(body),
            connection: "keep-alive",
          });

          res.end(body);
        },
      );

      await new Promise<void>((resolve) => {
        httpsUpstream.listen(0, "127.0.0.1", resolve);
      });

      httpsPort = (httpsUpstream.address() as net.AddressInfo).port;
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => {
        httpsUpstream.close(() => resolve());
      });
    });

    const makeHttpsRequest = (id: number): Promise<void> =>
      new Promise((resolve, reject) => {
        const proxySocket = net.connect(proxyPort, "127.0.0.1");

        let settled = false;
        let connectBuffer = Buffer.alloc(0);

        const finish = (error?: Error) => {
          if (settled) return;

          settled = true;

          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        proxySocket.once("error", finish);

        const onConnectData = (chunk: Buffer) => {
          connectBuffer = Buffer.concat([connectBuffer, chunk]);

          const headerEnd = connectBuffer.indexOf("\r\n\r\n");

          if (headerEnd === -1) return;

          proxySocket.off("data", onConnectData);

          const response = connectBuffer.subarray(0, headerEnd).toString();

          try {
            assert.match(response, /^HTTP\/1\.1 200 Connection Established/);
          } catch (error) {
            finish(error as Error);
            return;
          }

          const tlsSocket = tls.connect({
            socket: proxySocket,
            servername: "localhost",
            rejectUnauthorized: false,
          });

          tlsSocket.once("error", finish);

          tlsSocket.once("secureConnect", () => {
            let responseBuffer = Buffer.alloc(0);

            const onData = (chunk: Buffer) => {
              responseBuffer = Buffer.concat([responseBuffer, chunk]);

              const headerEnd = responseBuffer.indexOf(Buffer.from("\r\n\r\n"));

              if (headerEnd === -1) {
                return;
              }

              const header = responseBuffer.subarray(0, headerEnd).toString();

              const match = header.match(/content-length:\s*(\d+)/i);

              if (!match) {
                finish(new Error("Missing Content-Length"));
                return;
              }

              const contentLength = Number(match[1]);

              const bodyStart = headerEnd + 4;

              const bodyEnd = bodyStart + contentLength;

              if (responseBuffer.length < bodyEnd) {
                return;
              }

              try {
                const body = responseBuffer
                  .subarray(bodyStart, bodyEnd)
                  .toString();

                assert.match(header, /^HTTP\/1\.1 200/);

                assert.equal(body, `https-stress-response-${id}`);

                tlsSocket.off("data", onData);

                finish();
              } catch (error) {
                tlsSocket.off("data", onData);

                finish(error as Error);
              }
            };

            tlsSocket.on("data", onData);

            tlsSocket.write(
              [
                `GET /stress?id=${id} HTTP/1.1`,
                `Host: localhost:${httpsPort}`,
                "Connection: close",
                "",
                "",
              ].join("\r\n"),
            );
          });
        };

        proxySocket.on("data", onConnectData);

        proxySocket.write(
          [
            `CONNECT localhost:${httpsPort} HTTP/1.1`,
            `Host: localhost:${httpsPort}`,
            "Connection: keep-alive",
            "",
            "",
          ].join("\r\n"),
        );
      });

    it("handles sustained mixed HTTP and HTTPS traffic concurrently", async () => {
      const rounds = 10;
      const perProtocolConcurrency = 50;

      for (let round = 0; round < rounds; round++) {
        const httpRequests = Array.from(
          {
            length: perProtocolConcurrency,
          },
          (_, index) => makeHttpRequest(round * perProtocolConcurrency + index),
        );

        const httpsRequests = Array.from(
          {
            length: perProtocolConcurrency,
          },
          (_, index) =>
            makeHttpsRequest(round * perProtocolConcurrency + index),
        );

        await Promise.all([...httpRequests, ...httpsRequests]);
      }
    });

    it("remains stable across repeated mixed-protocol stress rounds", async () => {
      const runs = 5;
      const concurrency = 100;

      for (let run = 0; run < runs; run++) {
        const requests = Array.from({ length: concurrency }, (_, index) => {
          const id = run * concurrency + index;

          return index % 2 === 0 ? makeHttpRequest(id) : makeHttpsRequest(id);
        });

        await Promise.all(requests);
      }
    });
  });
});
