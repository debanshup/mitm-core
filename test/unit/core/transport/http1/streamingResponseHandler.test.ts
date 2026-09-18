import { strict as assert } from "assert";
import { PassThrough } from "stream";
import { ScopeMutator } from "../../../../../src/core/scope/ScopeMutator";
import { StreamingResponseHandler } from "../../../../../src/core/transport/http1/streamingResponseHandler";
import { ProxyUtils } from "../../../../../src/core/utils/ProxyUtils";

const createResponse = () => {
  const response: any = new PassThrough();

  response.statusCode = 200;
  response.responseHeaders = {};
  response.headersSent = false;

  response.writeHead = (status: number, headers: any) => {
    response.statusCode = status;
    response.responseHeaders = headers;
    response.headersSent = true;
    return response;
  };

  //  CRITICAL: Force the PassThrough to consume data immediately.
  // Without this, pipeline blocks because the write buffer fills up.
  response.resume();

  return response;
};

const createScope = (res = createResponse()) => {
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
        res,
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
    },
  } as any;
};

const createCacheProcessor = () => {
  return {
    trackedChunks: [] as Buffer[],
    committed: false,

    trackChunk(chunk: Buffer) {
      this.trackedChunks.push(chunk);
    },

    commit() {
      this.committed = true;
    },
  } as any;
};

describe("StreamingResponseHandler", () => {
  it("should fail when client response is unavailable", async () => {
    const scope = createScope();
    scope.request.client.res = undefined;

    const upstreamRes = new PassThrough() as any;
    upstreamRes.destroyed = false;

    const upstreamReq = scope.request.upstream.req;

    const cacheProcessor = createCacheProcessor();

    const originalFailPipeline = ScopeMutator.failPipeline;
    let failPipelineCalled = false;

    ScopeMutator.failPipeline = () => {
      failPipelineCalled = true;
    };

    try {
      await StreamingResponseHandler.handle(
        scope,
        upstreamRes,
        cacheProcessor,
        upstreamReq,
      );

      assert.equal(failPipelineCalled, true);
      assert.equal(upstreamRes.destroyed, true);
      assert.equal(upstreamReq.destroyed, true);
    } finally {
      ScopeMutator.failPipeline = originalFailPipeline;
    }
  });

  it("should write upstream status and headers", async () => {
    const response = createResponse();
    const scope = createScope(response);

    const upstreamRes = new PassThrough() as any;
    upstreamRes.statusCode = 201;
    upstreamRes.headers = {
      "content-type": "text/plain",
      "x-test": "hello",
    };
    upstreamRes.destroyed = false;

    const cacheProcessor = createCacheProcessor();

    const originalFinishPipeline = ScopeMutator.finishPipeline;
    ScopeMutator.finishPipeline = () => {};

    try {
      const promise = StreamingResponseHandler.handle(
        scope,
        upstreamRes,
        cacheProcessor,
        scope.request.upstream.req,
      );

      upstreamRes.end("hello");

      await promise;

      assert.equal(response.statusCode, 201);
      assert.equal(response.responseHeaders["content-type"], "text/plain");
      assert.equal(response.responseHeaders["x-test"], "hello");
    } finally {
      ScopeMutator.finishPipeline = originalFinishPipeline;
    }
  });

  it("should stream the upstream body to the client", async () => {
    const response = createResponse();
    const scope = createScope(response);

    const upstreamRes = new PassThrough() as any;
    upstreamRes.statusCode = 200;
    upstreamRes.headers = {};
    upstreamRes.destroyed = false;

    const cacheProcessor = createCacheProcessor();

    const originalFinishPipeline = ScopeMutator.finishPipeline;
    ScopeMutator.finishPipeline = () => {};

    try {
      const bodyPromise = new Promise<Buffer>((resolve) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => {
          chunks.push(Buffer.from(chunk));
        });

        response.on("end", () => {
          resolve(Buffer.concat(chunks));
        });
      });

      const handlerPromise = StreamingResponseHandler.handle(
        scope,
        upstreamRes,
        cacheProcessor,
        scope.request.upstream.req,
      );

      upstreamRes.end("hello world");

      const [body] = await Promise.all([bodyPromise, handlerPromise]);

      assert.equal(body.toString(), "hello world");
    } finally {
      ScopeMutator.finishPipeline = originalFinishPipeline;
    }
  });

  it("should track chunks and commit the cache after successful streaming", async () => {
    const response = createResponse();
    const scope = createScope(response);

    const upstreamRes = new PassThrough() as any;
    upstreamRes.statusCode = 200;
    upstreamRes.headers = {};
    upstreamRes.destroyed = false;

    const cacheProcessor = createCacheProcessor();

    const originalFinishPipeline = ScopeMutator.finishPipeline;
    const originalCleanup = ProxyUtils.cleanUp;

    let finishCalled = false;
    let cleanupCalled = false;

    ScopeMutator.finishPipeline = () => {
      finishCalled = true;
    };

    ProxyUtils.cleanUp = () => {
      cleanupCalled = true;
    };

    try {
      const promise = StreamingResponseHandler.handle(
        scope,
        upstreamRes,
        cacheProcessor,
        scope.request.upstream.req,
      );

      upstreamRes.write("hello ");
      upstreamRes.end("world");

      await promise;

      assert.equal(
        Buffer.concat(cacheProcessor.trackedChunks).toString(),
        "hello world",
      );
      assert.equal(cacheProcessor.committed, true);
      assert.equal(cleanupCalled, true);
      assert.equal(finishCalled, true);
    } finally {
      ScopeMutator.finishPipeline = originalFinishPipeline;
      ProxyUtils.cleanUp = originalCleanup;
    }
  });

  it("should finish the pipeline after successful streaming", async () => {
    const scope = createScope();

    const upstreamRes = new PassThrough() as any;
    upstreamRes.statusCode = 200;
    upstreamRes.headers = {};
    upstreamRes.destroyed = false;

    const cacheProcessor = createCacheProcessor();

    const originalFinishPipeline = ScopeMutator.finishPipeline;
    let finishCalled = false;

    ScopeMutator.finishPipeline = (receivedScope) => {
      finishCalled = true;
      assert.equal(receivedScope, scope);
    };

    try {
      const promise = StreamingResponseHandler.handle(
        scope,
        upstreamRes,
        cacheProcessor,
        scope.request.upstream.req,
      );

      upstreamRes.end("done");

      await promise;

      assert.equal(finishCalled, true);
    } finally {
      ScopeMutator.finishPipeline = originalFinishPipeline;
    }
  });

  it("should fail the pipeline and rethrow stream errors", async () => {
    const scope = createScope();

    const upstreamRes = new PassThrough() as any;
    upstreamRes.statusCode = 200;
    upstreamRes.headers = {};
    upstreamRes.destroyed = false;

    const cacheProcessor = createCacheProcessor();

    const originalFailPipeline = ScopeMutator.failPipeline;
    const originalCleanup = ProxyUtils.cleanUp;

    let failCalled = false;
    let cleanupCalled = false;

    ScopeMutator.failPipeline = (receivedScope) => {
      failCalled = true;
      assert.equal(receivedScope, scope);
    };

    ProxyUtils.cleanUp = () => {
      cleanupCalled = true;
    };

    const expectedError = new Error("stream failure");

    try {
      const promise = StreamingResponseHandler.handle(
        scope,
        upstreamRes,
        cacheProcessor,
        scope.request.upstream.req,
      );

      upstreamRes.destroy(expectedError);

      await assert.rejects(promise, (error) => {
        return error === expectedError;
      });

      assert.equal(cleanupCalled, true);
      assert.equal(failCalled, true);
    } finally {
      ScopeMutator.failPipeline = originalFailPipeline;
      ProxyUtils.cleanUp = originalCleanup;
    }
  });

    it("should fail and clean up when client response is already ended", async () => {
      const response = createResponse();
      const scope = createScope(response);

      // *** Set the state the handler checks ***
      response.end();

      const upstreamRes = new PassThrough() as any;
      const upstreamReq = scope.request.upstream.req;

      const cacheProcessor = createCacheProcessor();

      const originalFailPipeline = ScopeMutator.failPipeline;
      let failCalled = false;

      ScopeMutator.failPipeline = () => {
        failCalled = true;
      };

      try {
        await StreamingResponseHandler.handle(
          scope,
          upstreamRes,
          cacheProcessor,
          upstreamReq,
        );

        assert.equal(failCalled, true);
        assert.equal(upstreamRes.destroyed, true);
        assert.equal(upstreamReq.destroyed, true);
      } finally {
        ScopeMutator.failPipeline = originalFailPipeline;
      }
    });

    it("should fail and clean up when client response is destroyed", async () => {
      const response = createResponse();
      const scope = createScope(response);

      response.destroy();

      const upstreamRes = new PassThrough() as any;
      const upstreamReq = scope.request.upstream.req;

      const cacheProcessor = createCacheProcessor();

      const originalFailPipeline = ScopeMutator.failPipeline;
      let failCalled = false;

      ScopeMutator.failPipeline = () => {
        failCalled = true;
      };

      try {
        await StreamingResponseHandler.handle(
          scope,
          upstreamRes,
          cacheProcessor,
          upstreamReq,
        );

        assert.equal(failCalled, true);
        assert.equal(upstreamRes.destroyed, true);
        assert.equal(upstreamReq.destroyed, true);
      } finally {
        ScopeMutator.failPipeline = originalFailPipeline;
      }
    });

    it("should not overwrite response headers when they were already sent", async () => {
      const response = createResponse();
      const scope = createScope(response);

      response.headersSent = true;
      response.statusCode = 299;
      response.responseHeaders = {
        "x-existing": "yes",
      };

      const upstreamRes = new PassThrough() as any;
      upstreamRes.statusCode = 200;
      upstreamRes.headers = {
        "content-type": "text/plain",
      };

      const cacheProcessor = createCacheProcessor();

      const originalFinishPipeline = ScopeMutator.finishPipeline;
      ScopeMutator.finishPipeline = () => {};

      try {
        const promise = StreamingResponseHandler.handle(
          scope,
          upstreamRes,
          cacheProcessor,
          scope.request.upstream.req,
        );

        upstreamRes.end("body");

        await promise;

        assert.equal(response.statusCode, 299);
        assert.deepEqual(response.responseHeaders, {
          "x-existing": "yes",
        });
      } finally {
        ScopeMutator.finishPipeline = originalFinishPipeline;
      }
    });

    it("should not commit cache when streaming fails", async () => {
      const scope = createScope();

      const upstreamRes = new PassThrough() as any;
      upstreamRes.statusCode = 200;
      upstreamRes.headers = {};

      const cacheProcessor = createCacheProcessor();

      let commitCalled = false;

      cacheProcessor.commit = () => {
        commitCalled = true;
      };

      const originalFailPipeline = ScopeMutator.failPipeline;
      ScopeMutator.failPipeline = () => {};

      try {
        const promise = StreamingResponseHandler.handle(
          scope,
          upstreamRes,
          cacheProcessor,
          scope.request.upstream.req,
        );

        upstreamRes.destroy(new Error("stream failed"));

        await assert.rejects(promise);

        assert.equal(commitCalled, false);
      } finally {
        ScopeMutator.failPipeline = originalFailPipeline;
      }
    });
});
