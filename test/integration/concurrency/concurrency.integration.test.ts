import assert from "node:assert";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

import fs from "node:fs";

import { Proxy } from "../../../src/lib/Proxy";

const CA_CERT = fs.readFileSync("creds/__self__/CA.pem", "utf8");
const CA_KEY = fs.readFileSync("creds/__self__/key.pem", "utf8");

const UPSTREAM_CERT = fs.readFileSync("test/fixtures/certs/upstream-cert.pem");
const UPSTREAM_KEY = fs.readFileSync("test/fixtures/certs/upstream-key.pem");

export async function makeHttpsProxyRequest(
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
        try {
          const [headerPart, body = ""] = responseData.split("\r\n\r\n", 2);

          const statusLine = headerPart.split("\r\n")[0];

          const statusCode = Number(statusLine.split(" ")[1]);

          resolve({
            statusCode,
            body,
          });
        } catch (error) {
          reject(error);
        }
      });

      tlsSocket.on("error", reject);
    });

    connectReq.on("error", reject);
  });
}

describe("Proxy Concurrency Integration", () => {
  let upstream: http.Server | https.Server;
  let proxy: Proxy;

  let upstreamPort: number;
  let proxyPort: number;

  beforeEach(async () => {
    upstream = http.createServer((req, res) => {
      const body = req.url ?? "";

      res.writeHead(200, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(body),
        connection: "close",
      });

      res.end(body);
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

  it("should handle multiple concurrent HTTP requests", async () => {
    const requestCount = 100;

    const requests = Array.from({ length: requestCount }, (_, index) => {
      return new Promise<{
        statusCode?: number;
        body: string;
      }>((resolve, reject) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port: proxyPort,
            method: "GET",
            path: `http://127.0.0.1:${upstreamPort}/request-${index}`,
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

        req.on("error", reject);
        req.end();
      });
    });

    const responses = await Promise.all(requests);

    assert.equal(responses.length, requestCount);

    for (let index = 0; index < requestCount; index++) {
      assert.equal(responses[index].statusCode, 200);
      assert.equal(responses[index].body, `/request-${index}`);
    }
  });

  it("should handle multiple concurrent HTTP POST requests with isolated bodies", async () => {
    const requestCount = 100;

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

    const requests = Array.from({ length: requestCount }, (_, index) => {
      const body = `request-body-${index}`;

      return new Promise<{
        statusCode?: number;
        body: string;
      }>((resolve, reject) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port: proxyPort,
            method: "POST",
            path: `http://127.0.0.1:${upstreamPort}/request-${index}`,
            headers: {
              "content-type": "text/plain",
              "content-length": Buffer.byteLength(body),
            },
          },
          (res) => {
            let responseBody = "";

            res.on("data", (chunk) => {
              responseBody += chunk.toString();
            });

            res.on("end", () => {
              resolve({
                statusCode: res.statusCode,
                body: responseBody,
              });
            });
          },
        );

        req.on("error", reject);
        req.end(body);
      });
    });

    const responses = await Promise.all(requests);

    assert.equal(responses.length, requestCount);

    for (let index = 0; index < requestCount; index++) {
      assert.equal(responses[index].statusCode, 200);
      assert.equal(responses[index].body, `request-body-${index}`);
    }
  });

  it("should handle multiple concurrent HTTPS requests with isolated responses", async () => {
    const requestCount = 100;

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
      (req, res) => {
        const body = req.url ?? "";
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

    upstreamPort = (upstream.address() as net.AddressInfo).port;

    upstream.removeAllListeners("request");

    upstream.on("request", (req, res) => {
      const body = req.url ?? "";

      res.writeHead(200, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(body),
        connection: "close",
      });

      res.end(body);
    });

    const requests = Array.from(
      { length: requestCount },
      async (_, index) =>
        await makeHttpsProxyRequest(
          proxyPort,
          upstreamPort,
          `/request-${index}`,
        ),
    );

    const responses = await Promise.all(requests);

    assert.equal(responses.length, requestCount);

    for (let index = 0; index < requestCount; index++) {
      assert.equal(responses[index].statusCode, 200);
      assert.equal(responses[index].body, `/request-${index}`);
    }
  });
});
