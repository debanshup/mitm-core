import { strict as assert } from "assert";
import { H1OutboundBridge } from "../../../../src/core/transport/http1/H1OutboundBridge";
import { ResponseHandler } from "../../../../src/core/handlers/response.handler";
import { StreamingResponseHandler } from "../../../../src/core/transport/http1/streamingResponseHandler";
import { ScopeMutator } from "../../../../src/core/scope/ScopeMutator";
import EventEmitter from "events";
import { ResponseDispatcher } from "../../../../src/core/transport/http1/responseDispatcher";

class MockResponse {
  headersSent = false;
  writableEnded = false;
  destroyed = false;

  statusCode?: number;
  writtenHeaders?: Record<string, any>;
  endCalled = false;

  writeHead(status: number, headers: Record<string, any>) {
    this.statusCode = status;
    this.writtenHeaders = headers;
    this.headersSent = true;
  }

  end() {
    this.endCalled = true;
    this.writableEnded = true;
  }

  destroy(_error?: Error) {
    this.destroyed = true;
  }
}

class MockIncomingResponse extends EventEmitter {
  statusCode?: number;
  headers: Record<string, any>;
  destroyed = false;
  resumed = false;

  constructor(statusCode: number, headers: Record<string, any> = {}) {
    super();

    this.statusCode = statusCode;
    this.headers = headers;
  }

  resume() {
    this.resumed = true;
    return this;
  }
}

const createScope = () =>
  ({
    request: {
      client: {
        res: new MockResponse(),
      },
      target: {
        originalUrl: "https://example.com/test",
      },
    },
    lifecycle: {
      state: {
        set(key: string, value: unknown) {
          this.values[key] = value;
        },
        get(key: string) {
          return this.values[key];
        },
        values: {} as Record<string, unknown>,
      },
      nextPhase: "response",
    },
  }) as any;

const cacheProcessor = {} as any;
const upstream = {} as any;
describe("ResponseHandler", () => {
  it("should execute H1 outbound bridge for HTTP/1", async () => {
    const originalExecute = H1OutboundBridge.execute;

    let called = false;

    H1OutboundBridge.execute = (_scope, _config, resolve, _reject) => {
      called = true;
      resolve();
    };

    try {
      const handler = new ResponseHandler();

      const scope: any = {
        session: {
          protocol: {
            httpVersion: "h1",
          },
        },
      };

      await handler.handle(scope);

      assert.equal(called, true);
    } finally {
      H1OutboundBridge.execute = originalExecute;
    }
  });

  it("should resolve for HTTP/2", async () => {
    const originalExecute = H1OutboundBridge.execute;

    let called = false;

    H1OutboundBridge.execute = (_scope, _config, resolve, _reject) => {
      called = true;
      resolve();
    };

    try {
      const handler = new ResponseHandler();

      const scope: any = {
        session: {
          protocol: {
            httpVersion: "h2",
          },
        },
      };

      await handler.handle(scope);

      assert.equal(called, false);
    } finally {
      H1OutboundBridge.execute = originalExecute;
    }
  });

  it("should handle 204 response and finish the pipeline", async () => {
    const scope = createScope();

    const upstreamRes = new MockIncomingResponse(204, {
      "content-type": "text/plain",
      connection: "keep-alive",
    });

    await ResponseDispatcher.handle(
      scope,
      upstreamRes as any,
      cacheProcessor,
      upstream,
    );

    assert.equal(scope.request.client.res.statusCode, 204);
    assert.equal(scope.request.client.res.endCalled, true);

    assert.equal(
      scope.request.client.res.writtenHeaders["content-type"],
      "text/plain",
    );

    assert.equal(scope.request.client.res.writtenHeaders.connection, undefined);

    assert.equal(upstreamRes.resumed, true);
    assert.equal(scope.lifecycle.state.get("request.finished"), true);
  });

  it("should handle 304 response and finish the pipeline", async () => {
    const scope = createScope();

    const upstreamRes = new MockIncomingResponse(304, {
      etag: '"abc123"',
    });

    await ResponseDispatcher.handle(
      scope,
      upstreamRes as any,
      cacheProcessor,
      upstream,
    );

    assert.equal(scope.request.client.res.statusCode, 304);
    assert.equal(scope.request.client.res.endCalled, true);
    assert.equal(scope.lifecycle.state.get("request.finished"), true);
  });

  it("should handle informational responses and finish the pipeline", async () => {
    const scope = createScope();

    const upstreamRes = new MockIncomingResponse(103, {
      link: "</style.css>; rel=preload",
    });

    await ResponseDispatcher.handle(
      scope,
      upstreamRes as any,
      cacheProcessor,
      upstream,
    );

    assert.equal(scope.request.client.res.statusCode, 103);
    assert.equal(scope.request.client.res.endCalled, true);
    assert.equal(upstreamRes.resumed, true);

    assert.equal(scope.lifecycle.state.get("request.finished"), true);
  });

  it("should route WebSocket 101 response to StreamingResponseHandler", async () => {
    const scope = createScope();

    const upstreamRes = new MockIncomingResponse(101, {
      upgrade: "websocket",
    });

    const originalHandle = StreamingResponseHandler.handle;

    let called = false;

    (StreamingResponseHandler as any).handle = async () => {
      called = true;
    };

    try {
      await ResponseDispatcher.handle(
        scope,
        upstreamRes as any,
        cacheProcessor,
        upstream,
      );

      assert.equal(called, true);
    } finally {
      StreamingResponseHandler.handle = originalHandle;
    }
  });

  it("should safely handle a missing client response", async () => {
    const scope = createScope();

    scope.request.client.res = undefined;

    const upstreamRes = new MockIncomingResponse(204);

    await assert.doesNotReject(() =>
      ResponseDispatcher.handle(
        scope,
        upstreamRes as any,
        cacheProcessor,
        upstream,
      ),
    );

    assert.equal(upstreamRes.resumed, true);
    assert.equal(scope.lifecycle.state.get("request.finished"), true);
  });

  it("should fail the pipeline when streaming response handling fails", async () => {
    const scope = createScope();

    const upstreamRes = new MockIncomingResponse(200);

    const originalHandle = StreamingResponseHandler.handle;
    const originalFail = ScopeMutator.failPipeline;

    let failedScope: any;

    (StreamingResponseHandler as any).handle = async () => {
      throw new Error("streaming failed");
    };

    ScopeMutator.failPipeline = (receivedScope: any) => {
      failedScope = receivedScope;
    };

    try {
      await assert.doesNotReject(() =>
        ResponseDispatcher.handle(
          scope,
          upstreamRes as any,
          cacheProcessor,
          upstream,
        ),
      );

      assert.equal(failedScope, scope);
    } finally {
      StreamingResponseHandler.handle = originalHandle;
      ScopeMutator.failPipeline = originalFail;
    }
  });

  it("should fail the pipeline when streaming response handling fails", async () => {
    const scope = createScope();
    const upstreamRes = new MockIncomingResponse(200);

    const originalHandle = StreamingResponseHandler.handle;
    const originalFail = ScopeMutator.failPipeline;

    let failedScope: any;

    (StreamingResponseHandler as any).handle = async () => {
      throw new Error("streaming failed");
    };

    ScopeMutator.failPipeline = (receivedScope: any) => {
      failedScope = receivedScope;
    };

    try {
      await assert.doesNotReject(() =>
        ResponseDispatcher.handle(
          scope,
          upstreamRes as any,
          cacheProcessor,
          upstream,
        ),
      );

      assert.equal(failedScope, scope);
    } finally {
      StreamingResponseHandler.handle = originalHandle;
      ScopeMutator.failPipeline = originalFail;
    }
  });
});
