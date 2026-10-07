import { strict as assert } from "assert";
import { PassThrough } from "stream";
import { ResponseCacheProcessor } from "../../../../../src/core/cache/ResponseCacheProcessor";
import { H1OutboundBridge } from "../../../../../src/core/transport/http1/H1OutboundBridge";
import { ResponseDispatcher } from "../../../../../src/core/transport/http1/responseDispatcher";
import { pluginEventManager } from "../../../../../src/core/event/plugin-events/pluginEvents";
import { ScopeMutator } from "../../../../../src/core/scope/ScopeMutator";

const createResponse = () => {
  const response: any = {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    endCalled: false,

    writeHead(status: number, headers: Record<string, any>) {
      response.statusCode = status;
      response.responseHeaders = headers;
      response.headersSent = true;
    },

    end(body?: any) {
      response.endCalled = true;
      response.body = body;
      response.writableEnded = true;
    },

    destroy(error?: Error) {
      response.destroyed = true;
      response.destroyError = error;
    },

    once() {},
  };

  return response;
};

const createScope = () => {
  const clientReq = new PassThrough() as any;
  const clientRes = createResponse();

  clientReq.method = "GET";
  clientReq.headers = {
    host: "example.com",
  };
  clientReq.destroyed = false;

  const upstreamReq = new PassThrough() as any;
  upstreamReq.destroyed = false;

  return {
    session: {
      protocol: {
        httpVersion: "h1",
      },
    },

    request: {
      client: {
        req: clientReq,
        res: clientRes,
      },
      upstream: {
        req: upstreamReq,
      },
      target: {
        host: "example.com",
        url: "http://example.com/",
        originalUrl: "http://example.com/",
      },
    },

    lifecycle: {
      state: {
        values: {} as Record<string, unknown>,
        set(key: string, value: unknown) {
          this.values[key] = value;
        },
      },
      nextPhase: "response",

      timestamps: {},
    },
  } as any;
};

const createConfig = () =>
  ({
    useResponseCache: false,
  }) as any;

describe("H1OutboundBridge", () => {
  afterEach(() => {
    // Nothing global should remain mocked.
  });

  it("should resolve when required request objects are missing", async () => {
    const scope = createScope();

    scope.request.upstream.req = undefined;

    let resolved = false;

    H1OutboundBridge.execute(
      scope,
      createConfig(),
      () => {
        resolved = true;
      },
      () => {
        assert.fail("should not reject");
      },
    );

    assert.equal(resolved, true);
    assert.equal(scope.lifecycle.state.values.error, true);
  });

  it("should resolve immediately on cache hit", async () => {
    const scope = createScope();

    const originalTryServeHit = ResponseCacheProcessor.prototype.tryServeHit;

    let resolved = false;
    let dispatcherCalled = false;

    ResponseCacheProcessor.prototype.tryServeHit = function () {
      return true;
    };

    const originalHandle = ResponseDispatcher.handle;

    ResponseDispatcher.handle = async () => {
      dispatcherCalled = true;
    };

    try {
      H1OutboundBridge.execute(
        scope,
        createConfig(),
        () => {
          resolved = true;
        },
        () => {
          assert.fail("should not reject");
        },
      );

      assert.equal(resolved, true);
      assert.equal(dispatcherCalled, false);
    } finally {
      ResponseCacheProcessor.prototype.tryServeHit = originalTryServeHit;
      ResponseDispatcher.handle = originalHandle;
    }
  });

  it("should dispatch an upstream response", async () => {
    const scope = createScope();

    const originalHandle = ResponseDispatcher.handle;

    let dispatcherCalled = false;

    ResponseDispatcher.handle = async (
      receivedScope,
      _upstreamRes,
      _cacheProcessor,
      _upstream,
    ) => {
      dispatcherCalled = true;
      assert.equal(receivedScope, scope);
    };

    let resolved = false;

    try {
      H1OutboundBridge.execute(
        scope,
        createConfig(),
        () => {
          resolved = true;
        },
        (err) => {
          throw err;
        },
      );

      const upstreamRes = new PassThrough() as any;
      upstreamRes.statusCode = 200;
      upstreamRes.headers = {
        "content-type": "text/plain",
      };
      upstreamRes.destroyed = false;

      scope.request.upstream.req.emit("response", upstreamRes);

      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(dispatcherCalled, true);
      assert.equal(resolved, true);
    } finally {
      ResponseDispatcher.handle = originalHandle;
    }
  });

  it("should reject when response dispatcher fails", async () => {
    const scope = createScope();

    const originalHandle = ResponseDispatcher.handle;
    const expectedError = new Error("dispatcher failed");

    let rejectedError: any;

    ResponseDispatcher.handle = async () => {
      throw expectedError;
    };

    try {
      H1OutboundBridge.execute(
        scope,
        createConfig(),
        () => {
          assert.fail("should not resolve");
        },
        (err) => {
          rejectedError = err;
        },
      );

      const upstreamRes = new PassThrough() as any;
      upstreamRes.statusCode = 200;
      upstreamRes.headers = {};
      upstreamRes.destroyed = false;

      scope.request.upstream.req.emit("response", upstreamRes);

      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(rejectedError, expectedError);
    } finally {
      ResponseDispatcher.handle = originalHandle;
    }
  });

  it("should return 502 when upstream request fails", async () => {
    const scope = createScope();

    const originalFailPipeline = ScopeMutator.failPipeline;
    let failPipelineCalled = false;

    ScopeMutator.failPipeline = (_scope) => {
      failPipelineCalled = true;
    };

    const expectedError = new Error("upstream connection failed");

    let rejectedError: unknown;

    try {
      H1OutboundBridge.execute(
        scope,
        createConfig(),
        () => {
          assert.fail("should not resolve");
        },
        (err) => {
          rejectedError = err;
        },
      );

      scope.request.upstream.req.emit("error", expectedError);

      await new Promise((resolve) => setImmediate(resolve));

      const res = scope.request.client.res;

      assert.equal(failPipelineCalled, true);
      assert.equal(rejectedError, expectedError);
      assert.equal(res.statusCode, 502);
      assert.equal(res.endCalled, true);
      assert.equal(res.body, "Bad Gateway: Remote target connection dropped.");
    } finally {
      ScopeMutator.failPipeline = originalFailPipeline;
    }
  });

  it("should handle upstream errors", async () => {
    const scope = createScope();

    const upstream = scope.request.upstream.req;

    let rejectedError: unknown;

    H1OutboundBridge.execute(
      scope,
      createConfig(),
      () => {
        assert.fail("should not resolve");
      },
      (err) => {
        rejectedError = err;
      },
    );

    const error = new Error("upstream failed");

    upstream.emit("error", error);

    await new Promise((resolve) => setImmediate(resolve));

    const res = scope.request.client.res;

    assert.equal(rejectedError, error);
    assert.equal(res.statusCode, 502);
  });

  it("should destroy the client response when client disconnects", async () => {
    const scope = createScope();

    const expectedError = new Error("ERR_CLIENT_DISCONNECTED");

    let rejectedError: unknown;

    H1OutboundBridge.execute(
      scope,
      createConfig(),
      () => {
        assert.fail("should not resolve");
      },
      (err) => {
        rejectedError = err;
      },
    );

    scope.request.upstream.req.emit("error", expectedError);

    await new Promise((resolve) => setImmediate(resolve));

    const res = scope.request.client.res;

    assert.equal(rejectedError, expectedError);
    assert.equal(res.destroyed, true);
  });

  it("should emit proxy:target-error when upstream fails", async () => {
    const scope = createScope();

    const originalFailPipeline = ScopeMutator.failPipeline;
    ScopeMutator.failPipeline = () => {};

    const originalEmitAsync = pluginEventManager.emitAsync;

    let emittedEvent: string | undefined;
    let emittedScope: any;

    pluginEventManager.emitAsync = (async (eventName: any, payload: any) => {
      emittedEvent = eventName;
      emittedScope = payload.scope;
    }) as typeof pluginEventManager.emitAsync;

    const expectedError = new Error("target failed");

    try {
      H1OutboundBridge.execute(
        scope,
        createConfig(),
        () => {
          assert.fail("should not resolve");
        },
        () => {},
      );

      scope.request.upstream.req.emit("error", expectedError);

      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(emittedEvent, "proxy:target-error");
      assert.equal(emittedScope, scope);
    } finally {
      ScopeMutator.failPipeline = originalFailPipeline;
      pluginEventManager.emitAsync = originalEmitAsync;
    }
  });

  it("should ignore an upstream error after the response was already handled", async () => {
    const scope = createScope();

    const originalHandle = ResponseDispatcher.handle;
    const expectedError = new Error("late upstream error");

    let resolveCount = 0;
    let rejectCount = 0;

    ResponseDispatcher.handle = async () => {};

    try {
      H1OutboundBridge.execute(
        scope,
        createConfig(),
        () => {
          resolveCount++;
        },
        () => {
          rejectCount++;
        },
      );

      const upstreamRes = new PassThrough() as any;
      upstreamRes.statusCode = 200;
      upstreamRes.headers = {};
      upstreamRes.destroyed = false;

      scope.request.upstream.req.emit("response", upstreamRes);

      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(resolveCount, 1);
      assert.equal(rejectCount, 0);

      // Response is already settled.
      scope.request.upstream.req.emit("error", expectedError);

      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(resolveCount, 1);
      assert.equal(rejectCount, 0);
    } finally {
      ResponseDispatcher.handle = originalHandle;
    }
  });

  it("should handle only the first upstream error", async () => {
    const scope = createScope();

    const originalFailPipeline = ScopeMutator.failPipeline;

    let failPipelineCount = 0;
    let rejectCount = 0;

    ScopeMutator.failPipeline = () => {
      failPipelineCount++;
    };

    try {
      H1OutboundBridge.execute(
        scope,
        createConfig(),
        () => {
          assert.fail("should not resolve");
        },
        () => {
          rejectCount++;
        },
      );

      scope.request.upstream.req.emit(
        "error",
        new Error("first upstream error"),
      );

      await new Promise((resolve) => setImmediate(resolve));

      scope.request.upstream.req.emit(
        "error",
        new Error("second upstream error"),
      );

      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(failPipelineCount, 1);
      assert.equal(rejectCount, 1);
    } finally {
      ScopeMutator.failPipeline = originalFailPipeline;
    }
  });

  it("should still reject the original error when target-error plugin fails", async () => {
    const scope = createScope();

    const originalFailPipeline = ScopeMutator.failPipeline;
    const originalEmitAsync = pluginEventManager.emitAsync;

    const expectedError = new Error("target connection failed");

    let rejectedError: unknown;

    ScopeMutator.failPipeline = () => {};

    pluginEventManager.emitAsync = (async () => {
      throw new Error("plugin notification failed");
    }) as typeof pluginEventManager.emitAsync;

    try {
      H1OutboundBridge.execute(
        scope,
        createConfig(),
        () => {
          assert.fail("should not resolve");
        },
        (err) => {
          rejectedError = err;
        },
      );

      scope.request.upstream.req.emit("error", expectedError);

      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(rejectedError, expectedError);
    } finally {
      ScopeMutator.failPipeline = originalFailPipeline;
      pluginEventManager.emitAsync = originalEmitAsync;
    }
  });
});
