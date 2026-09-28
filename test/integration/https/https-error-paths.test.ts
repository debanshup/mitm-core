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

async function makeHttpsProxyRequestExpectAbort(
  proxyPort: number,
  upstreamPort: number,
  path: string,
): Promise<string> {
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
            createConnection: () => tlsSocket,
            agent: false,
          },
          (res) => {
            const chunks: Buffer[] = [];

            res.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });

            res.once("aborted", () => {
              resolve(Buffer.concat(chunks).toString());
            });

            res.once("error", reject);

            res.once("end", () => {
              reject(new Error("Expected HTTPS response to be aborted"));
            });
          },
        );

        req.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ECONNRESET") {
            resolve("request-reset");
            return;
          }

          reject(err);
        });

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

describe("HTTPS Error Path Matrix", () => {
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

  it("handles an upstream reset during the response", async () => {
    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    upstream = https.createServer(
      {
        key: UPSTREAM_KEY,
        cert: UPSTREAM_CERT,
      },
      (_req, res) => {
        res.writeHead(200, {
          "content-type": "text/plain",
          connection: "keep-alive",
        });

        res.write("partial");

        setTimeout(() => {
          res.socket?.destroy();
        }, 50);
      },
    );

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    const body = await makeHttpsProxyRequestExpectAbort(
      proxyPort,
      upstreamPort,
      "/reset",
    );

    assert.ok(body.includes("partial"));
  });

  it("handles an upstream reset during the request body", async () => {
    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    upstream = https.createServer(
      {
        key: UPSTREAM_KEY,
        cert: UPSTREAM_CERT,
      },
      (req) => {
        req.once("data", () => {
          req.socket.destroy();
        });
      },
    );

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(proxyPort, "127.0.0.1");

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

      socket.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNRESET" || err.code === "EPIPE") {
          finish();
          return;
        }

        finish(err);
      });

      socket.once("close", () => {
        finish();
      });

      socket.once("connect", () => {
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

        tlsSocket.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ECONNRESET" || err.code === "EPIPE") {
            finish();
            return;
          }

          finish(err);
        });

        tlsSocket.once("close", () => {
          finish();
        });

        tlsSocket.once("secureConnect", () => {
          tlsSocket.write(
            [
              `POST /reset HTTP/1.1`,
              `Host: localhost:${upstreamPort}`,
              "Content-Type: application/octet-stream",
              "Transfer-Encoding: chunked",
              "Connection: keep-alive",
              "",
              "",
            ].join("\r\n"),
          );

          // First chunk causes the upstream to destroy its socket.
          tlsSocket.write(
            `${Buffer.byteLength("x".repeat(64 * 1024)).toString(16)}\r\n`,
          );
          tlsSocket.write("x".repeat(64 * 1024));
          tlsSocket.write("\r\n");

          setTimeout(() => {
            if (!settled) {
              tlsSocket.write(
                `${Buffer.byteLength("y".repeat(64 * 1024)).toString(16)}\r\n`,
              );
              tlsSocket.write("y".repeat(64 * 1024));
              tlsSocket.write("\r\n");
              tlsSocket.write("0\r\n\r\n");
            }
          }, 100);
        });
      };

      socket.on("data", onConnectData);

      setTimeout(() => {
        if (!settled) {
          finish(
            new Error(
              "HTTPS client connection did not terminate after upstream reset",
            ),
          );
        }
      }, 1000);
    });
  });

  it("handles an HTTPS upstream connection refusal", async () => {
    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // // Reserve a port and immediately release it.
    // const unusedServer = await new Promise<net.Server>((resolve) => {
    //   const server = net.createServer();

    //   server.listen(0, "127.0.0.1", () => {
    //     server.close(() => resolve(server));
    //   });
    // });

    // upstreamPort = (unusedServer.address() as net.AddressInfo).port;

    upstreamPort = await new Promise<number>((resolve) => {
      const server = net.createServer();

      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as net.AddressInfo).port;

        server.close(() => resolve(port));
      });
    });

    // (Remove the old `upstreamPort = ...` line below it)

    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(proxyPort, "127.0.0.1");

      let settled = false;
      let buffer = Buffer.alloc(0);

      const finish = (error?: Error) => {
        if (settled) return;

        settled = true;

        if (error) reject(error);
        else resolve();
      };

      socket.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNRESET" || err.code === "EPIPE") {
          finish();
          return;
        }

        finish(err);
      });

      socket.once("close", () => {
        finish();
      });

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

        tlsSocket.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ECONNRESET" || err.code === "EPIPE") {
            finish();
            return;
          }

          finish(err);
        });

        tlsSocket.once("close", () => {
          finish();
        });

        tlsSocket.once("secureConnect", () => {
          let responseBuffer = Buffer.alloc(0);

          const onData = (chunk: Buffer) => {
            responseBuffer = Buffer.concat([responseBuffer, chunk]);

            const headerEnd = responseBuffer.indexOf(Buffer.from("\r\n\r\n"));

            if (headerEnd === -1) return;

            const header = responseBuffer.subarray(0, headerEnd).toString();

            try {
              assert.match(header, /^HTTP\/1\.1 502/);
              assert.match(responseBuffer.toString(), /Bad Gateway/i);

              tlsSocket.off("data", onData);
              finish();
            } catch (err) {
              tlsSocket.off("data", onData);
              finish(err as Error);
            }
          };

          tlsSocket.on("data", onData);

          tlsSocket.once("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "ECONNRESET" || err.code === "EPIPE") {
              finish();
              return;
            }

            finish(err);
          });

          tlsSocket.once("close", () => {
            finish();
          });

          tlsSocket.write(
            [
              "GET /refused HTTP/1.1",
              `Host: 127.0.0.1:${upstreamPort}`,
              "Connection: close",
              "",
              "",
            ].join("\r\n"),
          );
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

      setTimeout(() => {
        if (!settled) {
          finish(
            new Error(
              "HTTPS client connection did not terminate after upstream refusal",
            ),
          );
        }
      }, 1000);
    });
  });

  it("handles an HTTPS upstream close before response headers", async () => {
    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    upstream = https.createServer(
      {
        key: UPSTREAM_KEY,
        cert: UPSTREAM_CERT,
      },
      (req) => {
        req.socket.destroy();
      },
    );

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(proxyPort, "127.0.0.1");

      let settled = false;
      let buffer = Buffer.alloc(0);

      const finish = (error?: Error) => {
        if (settled) return;

        settled = true;

        if (error) reject(error);
        else resolve();
      };

      socket.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNRESET" || err.code === "EPIPE") {
          finish();
          return;
        }

        finish(err);
      });

      socket.once("close", () => {
        finish();
      });

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

        tlsSocket.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ECONNRESET" || err.code === "EPIPE") {
            finish();
            return;
          }

          finish(err);
        });

        tlsSocket.once("close", () => {
          finish();
        });

        tlsSocket.once("secureConnect", () => {
          let responseBuffer = Buffer.alloc(0);

          const onData = (chunk: Buffer) => {
            responseBuffer = Buffer.concat([responseBuffer, chunk]);

            const headerEnd = responseBuffer.indexOf(Buffer.from("\r\n\r\n"));

            if (headerEnd === -1) return;

            const header = responseBuffer.subarray(0, headerEnd).toString();

            try {
              assert.match(header, /^HTTP\/1\.1 502/);
              assert.match(responseBuffer.toString(), /Bad Gateway/i);

              tlsSocket.off("data", onData);
              finish();
            } catch (err) {
              tlsSocket.off("data", onData);
              finish(err as Error);
            }
          };

          tlsSocket.on("data", onData);

          tlsSocket.write(
            [
              "GET /early-close HTTP/1.1",
              `Host: 127.0.0.1:${upstreamPort}`,
              "Connection: close",
              "",
              "",
            ].join("\r\n"),
          );
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

      setTimeout(() => {
        if (!settled) {
          finish(
            new Error(
              "HTTPS client connection did not terminate after upstream close",
            ),
          );
        }
      }, 1000);
    });
  });

  
});
