import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";

import net from "node:net";

import { Proxy } from "../../../src/lib/Proxy";

const CA_CERT = fs.readFileSync("creds/__self__/CA.pem", "utf8");
const CA_KEY = fs.readFileSync("creds/__self__/key.pem", "utf8");

export async function makeHttpProxyRequest(
  proxyPort: number,
  upstreamPort: number,
  path: string,
): Promise<{
  statusCode: number;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: `http://127.0.0.1:${upstreamPort}${path}`,
        headers: {
          Host: `127.0.0.1:${upstreamPort}`,
          Connection: "keep-alive",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
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
}

describe("HTTP/1.1 Keep-Alive / Connection Reuse", () => {
  let upstream: http.Server;
  let proxy: Proxy;

  let upstreamPort: number;
  let proxyPort: number;

  let upstreamConnectionCount = 0;
  let upstreamRequestCount = 0;

  beforeEach(async () => {
    upstreamConnectionCount = 0;
    upstreamRequestCount = 0;

    upstream = http.createServer((req, res) => {
      upstreamRequestCount++;

      res.writeHead(200, {
        "content-type": "text/plain",
        "content-length": "2",
        connection: "keep-alive",
      });

      res.end("ok");
    });

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

  it("reuses the same upstream connection for sequential requests", async () => {
    const agent = new http.Agent({
      keepAlive: true,
    });

    try {
      const makeRequest = () =>
        new Promise<string>((resolve, reject) => {
          const req = http.request(
            {
              host: "127.0.0.1",
              port: proxyPort,
              path: `http://localhost:${upstreamPort}/test`,
              method: "GET",
              agent,
            },
            (res) => {
              const chunks: Buffer[] = [];

              res.on("data", (chunk: Buffer) => {
                chunks.push(chunk);
              });

              res.on("end", () => {
                resolve(Buffer.concat(chunks).toString());
              });

              res.on("error", reject);
            },
          );

          req.on("error", reject);
          req.end();
        });

      assert.equal(await makeRequest(), "ok");
      assert.equal(await makeRequest(), "ok");
      assert.equal(await makeRequest(), "ok");

      assert.equal(upstreamRequestCount, 3);
      assert.equal(upstreamConnectionCount, 1);
    } finally {
      agent.destroy();
    }
  });

  it("uses the upstream connection pool for concurrent requests", async () => {
    const results = await Promise.all([
      makeHttpProxyRequest(proxyPort, upstreamPort, "/1"),
      makeHttpProxyRequest(proxyPort, upstreamPort, "/2"),
      makeHttpProxyRequest(proxyPort, upstreamPort, "/3"),
    ]);

    for (const result of results) {
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.body, "ok");
    }

    assert.strictEqual(upstreamRequestCount, 3);
    assert.strictEqual(upstreamConnectionCount, 3);
  });
});
