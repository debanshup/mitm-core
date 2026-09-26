import assert from "node:assert/strict";
import http from "node:http";
import net from "net"
import { Proxy } from "../../../src/lib/Proxy";

describe("HTTP Proxy Integration", () => {
  let upstream: http.Server;
  let proxy: Proxy;

  let upstreamPort: number;
  let proxyPort: number;

  beforeEach(async () => {
   upstream = http.createServer((req, res) => {
     const chunks: Buffer[] = [];

     req.on("data", (chunk) => {
       chunks.push(Buffer.from(chunk));
     });

     req.on("end", () => {
       const body = Buffer.concat(chunks).toString();

       res.writeHead(200, {
         "content-type": "text/plain",
       });

       res.end(body || "hello from upstream");
     });
   });

    await new Promise<void>((resolve) => {
      upstream.listen(0, () => resolve());
    });

    proxy = new Proxy({
      useDefaultPipelines: true,
      useCertificateCache: false,
      useResponseCache: false,
    });

    await new Promise<void>((resolve) => {
      proxy.listen(0, resolve);
    });

    upstreamPort = (upstream.address() as any).port;
    proxyPort = (proxy.address() as any).port;
  });

  afterEach(async () => {
    await proxy.stop();

   await new Promise<void>((resolve, reject) => {
     if (!upstream.listening) {
       resolve();
       return;
     }

     upstream.close((err) => {
       if (err) reject(err);
       else resolve();
     });
   });
  });

  it("should proxy a GET request to the upstream server", async () => {
    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const req = http.request({
        host: "localhost",
        port: proxyPort,
        method: "GET",
        path: `http://localhost:${upstreamPort}/hello`,
        headers: {
          Host: `localhost:${upstreamPort}`,
        },
      });

      req.on("response", (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          });
        });
      });

      req.on("error", reject);
      req.end();
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "hello from upstream");
  });

  it("should proxy a POST request with body to the upstream server", async () => {
    const body = JSON.stringify({
      name: "mitm-core",
      type: "proxy",
    });

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const req = http.request({
        host: "localhost",
        port: proxyPort,
        method: "POST",
        path: `http://localhost:${upstreamPort}/data`,
        headers: {
          Host: `localhost:${upstreamPort}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      });

      const chunks: Buffer[] = [];

      req.on("response", (res) => {
        res.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          });
        });
      });

      req.on("error", reject);

      req.write(body);
      req.end();
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, body);
  });

  it("should proxy request headers to the upstream server", async () => {
    upstream.removeAllListeners("request");

    upstream.on("request", (req, res) => {
      res.writeHead(200, {
        "content-type": "application/json",
      });

      res.end(
        JSON.stringify({
          "x-test-header": req.headers["x-test-header"],
          "user-agent": req.headers["user-agent"],
        }),
      );
    });

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const req = http.request({
        host: "localhost",
        port: proxyPort,
        method: "GET",
        path: `http://localhost:${upstreamPort}/headers`,
        headers: {
          Host: `localhost:${upstreamPort}`,
          "X-Test-Header": "mitm-core-test",
          "User-Agent": "mitm-core-integration-test",
        },
      });

      const chunks: Buffer[] = [];

      req.on("response", (res) => {
        res.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          });
        });
      });

      req.on("error", reject);
      req.end();
    });

    assert.equal(response.statusCode, 200);

    const headers = JSON.parse(response.body);

    assert.equal(headers["x-test-header"], "mitm-core-test");
    assert.equal(headers["user-agent"], "mitm-core-integration-test");
  });

  it("should preserve request path and query string", async () => {
    upstream.removeAllListeners("request");

    upstream.on("request", (req, res) => {
      res.writeHead(200, {
        "content-type": "text/plain",
      });

      res.end(req.url);
    });

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const req = http.request({
        host: "localhost",
        port: proxyPort,
        method: "GET",
        path: `http://localhost:${upstreamPort}/users/profile?id=123&name=test`,
        headers: {
          Host: `localhost:${upstreamPort}`,
        },
      });

      const chunks: Buffer[] = [];

      req.on("response", (res) => {
        res.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          });
        });
      });

      req.on("error", reject);
      req.end();
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "/users/profile?id=123&name=test");
  });

  it("should forward an upstream 404 response", async () => {
    upstream.removeAllListeners("request");

    upstream.on("request", (_req, res) => {
      res.writeHead(404, {
        "content-type": "text/plain",
      });

      res.end("resource not found");
    });

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const req = http.request({
        host: "localhost",
        port: proxyPort,
        method: "GET",
        path: `http://localhost:${upstreamPort}/missing`,
        headers: {
          Host: `localhost:${upstreamPort}`,
        },
      });

      const chunks: Buffer[] = [];

      req.on("response", (res) => {
        res.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          });
        });
      });

      req.on("error", reject);
      req.end();
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body, "resource not found");
  });

  it("should forward an upstream 500 response", async () => {
    upstream.removeAllListeners("request");

    upstream.on("request", (_req, res) => {
      res.writeHead(500, {
        "content-type": "text/plain",
      });

      res.end("upstream failure");
    });

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const req = http.request({
        host: "localhost",
        port: proxyPort,
        method: "GET",
        path: `http://localhost:${upstreamPort}/error`,
        headers: {
          Host: `localhost:${upstreamPort}`,
        },
      });

      const chunks: Buffer[] = [];

      req.on("response", (res) => {
        res.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          });
        });
      });

      req.on("error", reject);
      req.end();
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.body, "upstream failure");
  });

  it("should return 502 when the upstream server is unavailable", async () => {
    const unavailablePort = upstreamPort;

    await new Promise<void>((resolve, reject) => {
      upstream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const req = http.request({
        host: "localhost",
        port: proxyPort,
        method: "GET",
        path: `http://localhost:${unavailablePort}/unavailable`,
        headers: {
          Host: `localhost:${unavailablePort}`,
        },
      });

      const chunks: Buffer[] = [];

      req.on("response", (res) => {
        res.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          });
        });
      });

      req.on("error", reject);
      req.end();
    });

    assert.equal(response.statusCode, 502);
  });

  it("should stream a large HTTP response without truncation", async function () {
    this.timeout(10000);

    const SIZE = 10 * 1024 * 1024; // 10 MB

    const payload = Buffer.alloc(SIZE, "a");

    const largeUpstream = http.createServer((_req, res) => {
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": payload.length,
      });

      const CHUNK_SIZE = 64 * 1024;

      let offset = 0;

      const writeChunk = () => {
        while (offset < payload.length) {
          const end = Math.min(offset + CHUNK_SIZE, payload.length);

          const canContinue = res.write(payload.subarray(offset, end));

          offset = end;

          if (!canContinue) {
            res.once("drain", writeChunk);
            return;
          }
        }

        res.end();
      };

      writeChunk();
    });

    await new Promise<void>((resolve) => {
      largeUpstream.listen(0, "127.0.0.1", resolve);
    });

    const port = (largeUpstream.address() as net.AddressInfo).port;

    try {
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        const req = http.get(
          {
            host: "127.0.0.1",
            port: proxyPort,
            path: `http://127.0.0.1:${port}/large`,
          },
          (res) => {
            res.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
            });

            res.once("end", resolve);
            res.once("error", reject);
          },
        );

        req.once("error", reject);
      });

      const received = Buffer.concat(chunks);

      assert.equal(received.length, SIZE);
      assert.equal(received.equals(payload), true);
    } finally {
      await new Promise<void>((resolve) => {
        largeUpstream.close(() => resolve());
      });
    }
  });

  it("should stream a large HTTP request body without truncation", async function () {
    this.timeout(10000);

    const SIZE = 10 * 1024 * 1024;
    const payload = Buffer.alloc(SIZE, "b");

    const largeUpstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on("end", () => {
        const received = Buffer.concat(chunks);

        res.writeHead(200, {
          "content-type": "application/json",
        });

        res.end(
          JSON.stringify({
            length: received.length,
            matches: received.equals(payload),
          }),
        );
      });

      req.on("error", (err) => {
        res.destroy(err);
      });
    });

    await new Promise<void>((resolve) => {
      largeUpstream.listen(0, "127.0.0.1", resolve);
    });

    const port = (largeUpstream.address() as net.AddressInfo).port;

    try {
      const response = await new Promise<{
        statusCode?: number;
        body: string;
      }>((resolve, reject) => {
        const req = http.request({
          host: "127.0.0.1",
          port: proxyPort,
          method: "POST",
          path: `http://127.0.0.1:${port}/large`,
          headers: {
            "content-type": "application/octet-stream",
            "content-length": payload.length,
          },
        });

        const chunks: Buffer[] = [];

        req.on("response", (res) => {
          res.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
          });

          res.on("end", () => {
            resolve({
              statusCode: res.statusCode,
              body: Buffer.concat(chunks).toString(),
            });
          });
        });

        req.on("error", reject);

        const CHUNK_SIZE = 64 * 1024;
        let offset = 0;

        const writeChunk = () => {
          while (offset < payload.length) {
            const end = Math.min(offset + CHUNK_SIZE, payload.length);

            const canContinue = req.write(payload.subarray(offset, end));

            offset = end;

            if (!canContinue) {
              req.once("drain", writeChunk);
              return;
            }
          }

          req.end();
        };

        writeChunk();
      });

      assert.equal(response.statusCode, 200);

      assert.deepEqual(JSON.parse(response.body), {
        length: SIZE,
        matches: true,
      });
    } finally {
      await new Promise<void>((resolve) => {
        largeUpstream.close(() => resolve());
      });
    }
  });
});
