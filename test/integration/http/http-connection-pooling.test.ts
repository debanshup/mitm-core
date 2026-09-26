import fs from "node:fs";
import http from "node:http";

import net from "node:net";

import { Proxy } from "../../../src/lib/Proxy";
import { makeHttpProxyRequest } from "./keep-alive-http.integration.test";
import assert from "node:assert";

const CA_CERT = fs.readFileSync("creds/__self__/CA.pem", "utf8");
const CA_KEY = fs.readFileSync("creds/__self__/key.pem", "utf8");

 
describe("HTTP/1.1 Connection Pooling", () => {
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

  it("reuses an idle HTTP upstream connection", async () => {
    const first = await makeHttpProxyRequest(proxyPort, upstreamPort, "/first");

    const second = await makeHttpProxyRequest(
      proxyPort,
      upstreamPort,
      "/second",
    );

    assert.strictEqual(first.statusCode, 200);
    assert.strictEqual(first.body, "ok");

    assert.strictEqual(second.statusCode, 200);
    assert.strictEqual(second.body, "ok");

    assert.strictEqual(upstreamRequestCount, 2);
    assert.strictEqual(upstreamConnectionCount, 1);
  });
});
