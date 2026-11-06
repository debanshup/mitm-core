import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "mocha";
import type { RequestScope } from "../../../src/core/scope/types";
import { getConfig } from "../../../src/config.registry";
import { HeaderResolver } from "../../../src/core/utils/HeaderResolver";

function createScope(reqHeaders: Record<string, any> = {}): RequestScope {
  return {
    request: {
      client: {
        req: {
          headers: reqHeaders,
        },
      },
      explicitHeaderOverrides: {},
    },
  } as RequestScope;
}

describe("HeaderResolver", () => {
  beforeEach(() => {
    // Reset global overrides before each test
    const config = getConfig();
    config.globalHeaderOverrides = {};
  });

  afterEach(() => {
    const config = getConfig();
    config.globalHeaderOverrides = {};
  });

  describe("resolveRequestHeaders()", () => {
    it("should inherit original request headers and convert to lowercase", () => {
      const scope = createScope({
        Host: "example.com",
        "User-Agent": "test-agent",
      });

      const resolved = HeaderResolver.resolveRequestHeaders(scope);

      assert.deepEqual(resolved, {
        host: "example.com",
        "user-agent": "test-agent",
      });
    });

    it("should apply global request overrides and overwrite originals", () => {
      const scope = createScope({ "x-original": "yes", host: "example.com" });
      getConfig().globalHeaderOverrides = {
        requestOverrides: {
          Host: "overridden.com",
          "X-Global": "global-value",
        },
      };

      const resolved = HeaderResolver.resolveRequestHeaders(scope);

      assert.deepEqual(resolved, {
        "x-original": "yes",
        host: "overridden.com",
        "x-global": "global-value",
      });
    });

    it("should apply per-request request overrides and overwrite globals", () => {
      const scope = createScope({ host: "example.com" });
      getConfig().globalHeaderOverrides = {
        requestOverrides: { host: "global.com", "x-shared": "global" },
      };

      scope.request.explicitHeaderOverrides = {
        requestOverrides: {
          Host: "per-request.com",
          "X-Shared": "per-request",
        },
      };

      const resolved = HeaderResolver.resolveRequestHeaders(scope);

      assert.deepEqual(resolved, {
        host: "per-request.com",
        "x-shared": "per-request",
      });
    });

    it("should remove headers specified in global requestHeadersToRemove (case-insensitive)", () => {
      const scope = createScope({ "x-remove-me": "yes", "x-keep": "yes" });
      getConfig().globalHeaderOverrides = {
        requestHeadersToRemove: ["X-Remove-Me"],
      };

      const resolved = HeaderResolver.resolveRequestHeaders(scope);

      assert.equal(resolved["x-remove-me"], undefined);
      assert.equal(resolved["x-keep"], "yes");
    });

    it("should remove headers specified in per-request requestHeadersToRemove", () => {
      const scope = createScope({ "x-global": "keep", "x-remove": "yes" });
      scope.request.explicitHeaderOverrides = {
        requestHeadersToRemove: ["X-Remove"],
      };

      const resolved = HeaderResolver.resolveRequestHeaders(scope);

      assert.equal(resolved["x-remove"], undefined);
      assert.equal(resolved["x-global"], "keep");
    });

    it("should remove headers explicitly set to null or undefined in overrides", () => {
      const scope = createScope({
        "x-null": "yes",
        "x-undefined": "yes",
        "x-keep": "yes",
      });
      scope.request.explicitHeaderOverrides = {
        requestOverrides: {
          "X-Null": null as any,
          "X-Undefined": undefined as any,
        },
      };

      const resolved = HeaderResolver.resolveRequestHeaders(scope);

      assert.equal(resolved["x-null"], undefined);
      assert.equal(resolved["x-undefined"], undefined);
      assert.equal(resolved["x-keep"], "yes");
    });
  });

  describe("resolveResponseHeaders()", () => {
    it("should inherit upstream response headers and convert to lowercase", () => {
      const scope = createScope();
      const upstreamHeaders = {
        "Content-Type": "text/html",
        "Cache-Control": "no-cache",
      };

      const resolved = HeaderResolver.resolveResponseHeaders(
        scope,
        upstreamHeaders,
      );

      assert.deepEqual(resolved, {
        "content-type": "text/html",
        "cache-control": "no-cache",
      });
    });

    it("should apply global response overrides and overwrite originals", () => {
      const scope = createScope();
      const upstreamHeaders = { server: "upstream-server" };
      getConfig().globalHeaderOverrides = {
        responseOverrides: {
          Server: "proxy-server",
          "X-Injected": "global",
        },
      };

      const resolved = HeaderResolver.resolveResponseHeaders(
        scope,
        upstreamHeaders,
      );

      assert.deepEqual(resolved, {
        server: "proxy-server",
        "x-injected": "global",
      });
    });

    it("should apply per-request response overrides and overwrite globals", () => {
      const scope = createScope();
      const upstreamHeaders = { "x-status": "original" };
      getConfig().globalHeaderOverrides = {
        responseOverrides: { "X-Status": "global" },
      };
      scope.request.explicitHeaderOverrides = {
        responseOverrides: { "X-Status": "per-request" },
      };

      const resolved = HeaderResolver.resolveResponseHeaders(
        scope,
        upstreamHeaders,
      );

      assert.deepEqual(resolved, {
        "x-status": "per-request",
      });
    });

    it("should remove headers specified in responseHeadersToRemove arrays", () => {
      const scope = createScope();
      const upstreamHeaders = {
        "x-global-remove": "yes",
        "x-request-remove": "yes",
        "x-keep": "yes",
      };

      getConfig().globalHeaderOverrides = {
        responseHeadersToRemove: ["X-Global-Remove"],
      };
      scope.request.explicitHeaderOverrides = {
        responseHeadersToRemove: ["x-request-remove"],
      };

      const resolved = HeaderResolver.resolveResponseHeaders(
        scope,
        upstreamHeaders,
      );

      assert.equal(resolved["x-global-remove"], undefined);
      assert.equal(resolved["x-request-remove"], undefined);
      assert.equal(resolved["x-keep"], "yes");
    });

    it("should remove response headers explicitly set to null or undefined", () => {
      const scope = createScope();
      const upstreamHeaders = { "x-delete": "yes" };

      scope.request.explicitHeaderOverrides = {
        responseOverrides: { "X-Delete": null as any },
      };

      const resolved = HeaderResolver.resolveResponseHeaders(
        scope,
        upstreamHeaders,
      );

      assert.equal(resolved["x-delete"], undefined);
    });
  });
});

describe("HeaderResolver Edge Cases", function () {
  beforeEach(() => {
    getConfig().globalHeaderOverrides = {};
  });

  afterEach(() => {
    getConfig().globalHeaderOverrides = {};
  });

  it("should resolve header collisions case-insensitively", () => {
    const scope = createScope({
      "X-Shared": "original",
    });

    getConfig().globalHeaderOverrides = {
      requestOverrides: {
        "X-SHARED": "global",
      },
    };

    scope.request.explicitHeaderOverrides = {
      requestOverrides: {
        "x-shared": "request",
      },
    };

    const result = HeaderResolver.resolveRequestHeaders(scope);

    assert.equal(result["x-shared"], "request");
    assert.equal(
      Object.keys(result).filter((key) => key.toLowerCase() === "x-shared")
        .length,
      1,
    );
  });

  it("should give removal rules precedence over overrides", () => {
    const scope = createScope({
      "x-conflict": "original",
      "x-global-remove": "original",
    });

    getConfig().globalHeaderOverrides = {
      requestOverrides: {
        "x-conflict": "global",
        "x-global-remove": "global",
      },
      requestHeadersToRemove: ["X-Conflict"],
    };

    scope.request.explicitHeaderOverrides = {
      requestOverrides: {
        "x-conflict": "request",
        "x-global-remove": "request",
      },
      requestHeadersToRemove: ["X-Global-Remove"],
    };

    const result = HeaderResolver.resolveRequestHeaders(scope);

    assert.equal(result["x-conflict"], undefined);
    assert.equal(result["x-global-remove"], undefined);
  });

  it("should preserve multiple header values", () => {
    const scope = createScope();

    scope.request.explicitHeaderOverrides = {
      requestOverrides: {
        "x-multiple": ["value-one", "value-two"],
      },
      responseOverrides: {
        "x-response-multiple": ["response-one", "response-two"],
      },
    };

    const requestHeaders = HeaderResolver.resolveRequestHeaders(scope);

    const responseHeaders = HeaderResolver.resolveResponseHeaders(scope, {});

    assert.deepEqual(requestHeaders["x-multiple"], ["value-one", "value-two"]);

    assert.deepEqual(responseHeaders["x-response-multiple"], [
      "response-one",
      "response-two",
    ]);
  });

  it("should not mutate original request or response headers", () => {
    const originalRequestHeaders = {
      Host: "example.com",
      "X-Original": "request",
    };

    const originalResponseHeaders = {
      "Content-Type": "application/json",
      "X-Original": "response",
    };

    const scope = createScope(originalRequestHeaders);

    HeaderResolver.resolveRequestHeaders(scope);

    HeaderResolver.resolveResponseHeaders(scope, originalResponseHeaders);

    assert.deepEqual(originalRequestHeaders, {
      Host: "example.com",
      "X-Original": "request",
    });

    assert.deepEqual(originalResponseHeaders, {
      "Content-Type": "application/json",
      "X-Original": "response",
    });
  });

  it("should isolate overrides between different requests", () => {
    const firstScope = createScope();
    const secondScope = createScope();

    firstScope.request.explicitHeaderOverrides = {
      requestOverrides: {
        "x-request-id": "first",
      },
    };

    secondScope.request.explicitHeaderOverrides = {
      requestOverrides: {
        "x-request-id": "second",
      },
    };

    const firstResult = HeaderResolver.resolveRequestHeaders(firstScope);

    const secondResult = HeaderResolver.resolveRequestHeaders(secondScope);

    assert.equal(firstResult["x-request-id"], "first");
    assert.equal(secondResult["x-request-id"], "second");
  });

  it("should keep request and response overrides independent", () => {
    const scope = createScope({
      "x-direction": "client-request",
    });

    getConfig().globalHeaderOverrides = {
      requestOverrides: {
        "x-direction": "upstream-request",
      },
      responseOverrides: {
        "x-direction": "client-response",
      },
    };

    const requestHeaders = HeaderResolver.resolveRequestHeaders(scope);

    const responseHeaders = HeaderResolver.resolveResponseHeaders(scope, {
      "x-direction": "upstream-response",
    });

    assert.equal(requestHeaders["x-direction"], "upstream-request");

    assert.equal(responseHeaders["x-direction"], "client-response");
  });

  it("should remove null and undefined request overrides", () => {
    const scope = createScope({
      "x-null": "original",
      "x-undefined": "original",
      "x-keep": "original",
    });

    scope.request.explicitHeaderOverrides = {
      requestOverrides: {
        "x-null": null as any,
        "x-undefined": undefined as any,
      },
    };

    const result = HeaderResolver.resolveRequestHeaders(scope);

    assert.equal(result["x-null"], undefined);
    assert.equal(result["x-undefined"], undefined);
    assert.equal(result["x-keep"], "original");
  });
});
