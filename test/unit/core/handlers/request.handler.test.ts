import assert from "node:assert/strict";

import { RequestHandler } from "../../../../src/core/handlers/request.handler";
import { UpstreamInitiator } from "../../../../src/core/transport/http1/UpstreamInitiator";
import { ScopeMutator } from "../../../../src/core/scope/ScopeMutator";
import { pluginEventManager } from "../../../../src/core/event/plugin-events/pluginEvents";

const createResponse = () => {
  return {
    statusCode: 200,
    writableEnded: false,
    endCalled: false,
    end(body?: string) {
      this.endCalled = true;
      this.body = body;
      this.writableEnded = true;
    },
    body: undefined as string | undefined,
  };
};

const createScope = (overrides: any = {}) =>
  ({
    session: {
      protocol: {
        httpVersion: "h1",
      },
    },

    request: {
      client: {
        req: {
          url: "/test",
          headers: {
            host: "example.com",
          },
        },
        res: createResponse(),
      },

      target: {
        url: undefined,
        host: "example.com",
      },

      upstream: {},
    },

    lifecycle: {
      state: {
        set() {},
        get() {},
      },

      isHijacked: false,

      timestamps: {
        receivedAt: Date.now(),
      },

      nextPhase: undefined,
    },

    ...overrides,
  }) as any;
describe("RequestHandler", () => {
  it("should return when H1 client request is missing", async () => {
    const handler = new RequestHandler();

    const scope = createScope();

    scope.request.client.req = undefined;

    await assert.doesNotReject(() => handler.handle(scope));
  });

  it("should use request.target.url when available", async () => {
    const handler = new RequestHandler();
    const scope = createScope();

    scope.request.target.url = "https://target.example/path";

    const originalInit = UpstreamInitiator.initH1UpstreamReq;

    const originalApply = ScopeMutator.applyUpstreamInitState;

    const originalEmit = pluginEventManager.emitAsync;

    let receivedUrl: URL | undefined;
    let emitCalled = false;

    UpstreamInitiator.initH1UpstreamReq = (async (targetUrl) => {
      receivedUrl = targetUrl;
      return {} as any;
    }) as typeof UpstreamInitiator.initH1UpstreamReq;

    ScopeMutator.applyUpstreamInitState = () => true;

    pluginEventManager.emitAsync = (async () => {
      emitCalled = true;
    }) as typeof pluginEventManager.emitAsync;

    try {
      await handler.handle(scope);

      assert.equal(receivedUrl?.href, "https://target.example/path");
      assert.equal(emitCalled, true);
    } finally {
      UpstreamInitiator.initH1UpstreamReq = originalInit;
      ScopeMutator.applyUpstreamInitState = originalApply;
      pluginEventManager.emitAsync = originalEmit;
    }
  });

  it("should build an absolute URL from an absolute client request URL", async () => {
    const handler = new RequestHandler();
    const scope = createScope();

    scope.request.target.url = undefined;
    scope.request.client.req.url = "https://target.example/api?q=1";

    const originalInit = UpstreamInitiator.initH1UpstreamReq;

    let receivedUrl: URL | undefined;

    UpstreamInitiator.initH1UpstreamReq = (async (targetUrl) => {
      receivedUrl = targetUrl;
      return {} as any;
    }) as typeof UpstreamInitiator.initH1UpstreamReq;

    try {
      await handler.handle(scope);

      assert.equal(receivedUrl?.href, "https://target.example/api?q=1");
    } finally {
      UpstreamInitiator.initH1UpstreamReq = originalInit;
    }
  });

  it("should build an HTTPS URL from a relative client request", async () => {
    const handler = new RequestHandler();
    const scope = createScope();

    scope.request.client.req.url = "/api/data";

    const originalInit = UpstreamInitiator.initH1UpstreamReq;

    let receivedUrl: URL | undefined;

    UpstreamInitiator.initH1UpstreamReq = (async (targetUrl) => {
      receivedUrl = targetUrl;
      return {} as any;
    }) as typeof UpstreamInitiator.initH1UpstreamReq;

    try {
      await handler.handle(scope);

      assert.equal(receivedUrl?.href, "https://example.com/api/data");
    } finally {
      UpstreamInitiator.initH1UpstreamReq = originalInit;
    }
  });

  it("should return 400 for an invalid H1 URL", async () => {
    const handler = new RequestHandler();
    const scope = createScope();

    scope.request.target.url = "://invalid-url";

    await handler.handle(scope);

    assert.equal(scope.request.client.res.statusCode, 400);
    assert.equal(scope.request.client.res.endCalled, true);
    assert.equal(scope.request.client.res.body, "Invalid URL");
  });

  it("should stop when upstream initialization state cannot be applied", async () => {
    const handler = new RequestHandler();
    const scope = createScope();

    const originalInit = UpstreamInitiator.initH1UpstreamReq;

    const originalApply = ScopeMutator.applyUpstreamInitState;

    const originalEmit = pluginEventManager.emitAsync;

    let emitCalled = false;

    UpstreamInitiator.initH1UpstreamReq = (async () => {
      return {} as any;
    }) as typeof UpstreamInitiator.initH1UpstreamReq;

    ScopeMutator.applyUpstreamInitState = () => false;

    pluginEventManager.emitAsync = (async () => {
      emitCalled = true;
    }) as typeof pluginEventManager.emitAsync;

    try {
      await handler.handle(scope);

      assert.equal(emitCalled, false);
    } finally {
      UpstreamInitiator.initH1UpstreamReq = originalInit;
      ScopeMutator.applyUpstreamInitState = originalApply;
      pluginEventManager.emitAsync = originalEmit;
    }
  });

  it("should fall back to HTTP/1.1 processing for an unsupported HTTP version", async () => {
    const handler = new RequestHandler();
    const scope = createScope();

    scope.session.protocol.httpVersion = "unknown";

    const originalInit = UpstreamInitiator.initH1UpstreamReq;
    const originalApply = ScopeMutator.applyUpstreamInitState;

    let receivedUrl: URL | undefined;

    UpstreamInitiator.initH1UpstreamReq = (async (targetUrl) => {
      receivedUrl = targetUrl;
      return {} as any;
    }) as typeof UpstreamInitiator.initH1UpstreamReq;

    ScopeMutator.applyUpstreamInitState = () => true;

    try {
      await handler.handle(scope);

      assert.equal(receivedUrl?.href, "https://example.com/test");
    } finally {
      UpstreamInitiator.initH1UpstreamReq = originalInit;
      ScopeMutator.applyUpstreamInitState = originalApply;
    }
  });

  it("should return 400 when fallback URL is invalid", async () => {
    const handler = new RequestHandler();
    const scope = createScope();

    scope.session.protocol.httpVersion = "unknown";
   scope.request.client.req.url = "http://[invalid";

    await handler.handle(scope);

    assert.equal(scope.request.client.res.statusCode, 400);
    assert.equal(scope.request.client.res.endCalled, true);
    assert.equal(scope.request.client.res.body, "Bad Request: Invalid URL");
  });

  it("should propagate upstream initialization errors", async () => {
    const handler = new RequestHandler();
    const scope = createScope();

    const originalInit = UpstreamInitiator.initH1UpstreamReq;

    UpstreamInitiator.initH1UpstreamReq = (async () => {
      throw new Error("upstream connection failed");
    }) as typeof UpstreamInitiator.initH1UpstreamReq;

    try {
      await assert.rejects(() => handler.handle(scope), {
        message: "upstream connection failed",
      });
    } finally {
      UpstreamInitiator.initH1UpstreamReq = originalInit;
    }
  });

  it("should emit proxy:upstream-dispatch after upstream initialization", async () => {
    const handler = new RequestHandler();
    const scope = createScope();

    const originalInit = UpstreamInitiator.initH1UpstreamReq;
    const originalApply = ScopeMutator.applyUpstreamInitState;
    const originalEmit = pluginEventManager.emitAsync;

    let receivedScope: any;
    let emitted = false;

    UpstreamInitiator.initH1UpstreamReq = (async () => {
      return {} as any;
    }) as typeof UpstreamInitiator.initH1UpstreamReq;

    ScopeMutator.applyUpstreamInitState = () => true;

    pluginEventManager.emitAsync = (async (event: any, payload: any) => {
      if (event === "proxy:upstream-dispatch") {
        emitted = true;
        receivedScope = payload.scope;
      }
    }) as typeof pluginEventManager.emitAsync;

    try {
      await handler.handle(scope);

      assert.equal(emitted, true);
      assert.equal(receivedScope, scope);
    } finally {
      UpstreamInitiator.initH1UpstreamReq = originalInit;
      ScopeMutator.applyUpstreamInitState = originalApply;
      pluginEventManager.emitAsync = originalEmit;
    }
  });

  
});
