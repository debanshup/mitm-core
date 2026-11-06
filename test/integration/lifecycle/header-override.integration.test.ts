import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { describe, it, beforeEach, afterEach } from "mocha";
import { Proxy } from "../../../src/lib/Proxy";
import { BasePlugin } from "../../../src/core/plugin/BasePlugin";
import type { PluginPayload } from "../../../src/core/plugin/BasePlugin";
import { getConfig } from "../../../src/config.registry";
import { HeaderResolver } from "../../../src/core/utils/HeaderResolver";
import type { RequestScope } from "../../../src/core/scope/types";

class RequestOverridePlugin extends BasePlugin<"proxy:client-http-request"> {
  readonly event = "proxy:client-http-request";

  run({ scope }: PluginPayload<"proxy:client-http-request">) {
    scope.request.explicitHeaderOverrides = {
      ...scope.request.explicitHeaderOverrides,
      requestOverrides: {
        "x-test-runner": "active-test-runner",
        "x-plugin-override": "request-won",
      },
      requestHeadersToRemove: ["x-client-remove"],
    };
  }
}

class ResponseOverridePlugin extends BasePlugin<"proxy:target-response"> {
  readonly event = "proxy:target-response";

  run({ scope }: PluginPayload<"proxy:target-response">) {
    scope.request.explicitHeaderOverrides = {
      ...scope.request.explicitHeaderOverrides,
      responseOverrides: {
        "x-proxy-injected": "yes",
      },
      responseHeadersToRemove: ["x-upstream-remove"],
    };
  }
}

describe("MITM-Core Hierarchical Header Overrides Regression Suite", function () {
  let upstream: http.Server;
  let proxy: Proxy;
  let upstreamPort: number;
  let proxyPort: number;

  beforeEach(async () => {
    upstream = http.createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "X-Upstream-Remove": "delete-me",
        "X-Upstream-Keep": "keep-me",
        "X-Global-Res-Remove": "delete-me-too",
      });
      res.end(JSON.stringify(req.headers));
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, "127.0.0.1", resolve);
    });
    upstreamPort = (upstream.address() as net.AddressInfo).port;

    const config = getConfig();
    config.globalHeaderOverrides = {
      requestOverrides: {
        "x-global-req": "global-req-val",
      },
      requestHeadersToRemove: ["x-global-req-remove"],
      responseOverrides: {
        "x-global-res": "global-res-val",
      },
      responseHeadersToRemove: ["x-global-res-remove"],
    };

    proxy = new Proxy({
      useDefaultPipelines: true,
      useCertificateCache: false,
      useResponseCache: false,
    });

    proxy.use(new RequestOverridePlugin());
    proxy.use(new ResponseOverridePlugin());

    await new Promise<void>((resolve) => {
      proxy.listen(0, resolve);
    });
    proxyPort = (proxy.address() as net.AddressInfo).port;
  });

  afterEach(async () => {
    const config = getConfig();
    config.globalHeaderOverrides = {}; // Clean up globals

    await proxy.stop();
    await new Promise<void>((resolve) => {
      upstream.close(() => resolve());
    });
  });

  it("should merge and apply hierarchical overrides correctly", async () => {
    const result = await new Promise<{
      statusCode: number | undefined;
      headers: http.IncomingHttpHeaders;
      body: string;
    }>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: proxyPort,
          method: "GET",
          path: `http://127.0.0.1:${upstreamPort}/test`,
          headers: {
            Host: `127.0.0.1:${upstreamPort}`,
            Connection: "close",
            "X-Client-Remove": "should-be-gone",
            "X-Global-Req-Remove": "should-be-gone-too",
            "X-Client-Keep": "stay",
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk.toString()));
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body,
            });
          });
        },
      );
      req.on("error", reject);
      req.end();
    });

    assert.equal(result.statusCode, 200);

    // Verify Request Headers (Proxy -> Upstream)
    const upstreamHeaders = JSON.parse(result.body);

    assert.equal(
      upstreamHeaders["x-test-runner"],
      "active-test-runner",
      "Local request override framework failure.",
    );
    assert.equal(upstreamHeaders["x-plugin-override"], "request-won");
    assert.equal(upstreamHeaders["x-global-req"], "global-req-val");
    assert.equal(upstreamHeaders["x-client-keep"], "stay");

    assert.equal(upstreamHeaders["x-client-remove"], undefined);
    assert.equal(upstreamHeaders["x-global-req-remove"], undefined);

    // Verify Response Headers (Proxy -> Client)

    const clientHeaders = result.headers;

    assert.equal(clientHeaders["x-proxy-injected"], "yes");
    assert.equal(clientHeaders["x-global-res"], "global-res-val");
    assert.equal(clientHeaders["x-upstream-keep"], "keep-me");

    assert.equal(clientHeaders["x-upstream-remove"], undefined);
    assert.equal(clientHeaders["x-global-res-remove"], undefined);
  });
});
