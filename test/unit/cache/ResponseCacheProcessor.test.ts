import assert from "node:assert";
import { ResponseCacheProcessor } from "../../../src/core/cache/ResponseCacheProcessor";
import { ResponseCache } from "../../../src/core/cache/ResponseCache";
import { PassThrough } from "node:stream";

describe("ResponseCacheProcessor", () => {
  describe("sanitizeHeaders()", () => {
    it("should keep only allowed headers", () => {
      const result = ResponseCacheProcessor.sanitizeHeaders({
        "content-type": "application/json",
        etag: "abc123",
        "cache-control": "max-age=60",
        connection: "keep-alive",
        "set-cookie": "session=abc",
        "x-custom": "value",
      });

      assert.deepEqual(result, {
        "content-type": "application/json",
        etag: "abc123",
        "cache-control": "max-age=60",
      });
    });

    it("should normalize header names to lowercase", () => {
      const result = ResponseCacheProcessor.sanitizeHeaders({
        "Content-Type": "text/plain",
        ETag: "abc",
        "Cache-Control": "max-age=60",
      });

      assert.deepEqual(result, {
        "content-type": "text/plain",
        etag: "abc",
        "cache-control": "max-age=60",
      });
    });

    it("should join array header values", () => {
      const result = ResponseCacheProcessor.sanitizeHeaders({
        vary: ["Accept-Encoding", "Origin"],
        "access-control-allow-methods": ["GET", "POST"],
      });

      assert.deepEqual(result, {
        vary: "Accept-Encoding, Origin",
        "access-control-allow-methods": "GET, POST",
      });
    });

    it("should return an empty object when no headers are allowed", () => {
      const result = ResponseCacheProcessor.sanitizeHeaders({
        connection: "keep-alive",
        "set-cookie": "session=abc",
        "x-custom": "value",
      });

      assert.deepEqual(result, {});
    });
  });

  describe("tryServeHit()", () => {
    const createResponse = () => {
      const response: any = {
        headersSent: false,
        writableEnded: false,
        writeHeadCalled: false,
        endCalled: false,

        writeHead(status: number, headers: Record<string, any>) {
          response.writeHeadCalled = true;
          response.statusCode = status;
          response.responseHeaders = headers;
        },

        end(body: Buffer) {
          response.endCalled = true;
          response.body = body;
        },
      };

      return response;
    };

    const createScope = (res: any) => {
      const req = {
        method: "GET",
        url: "/cached",
        headers: {
          host: "example.com",
          "accept-encoding": "gzip",
        },
      } as any;

      return {
        session: {
          connectionId: `test-${Date.now()}-${Math.random()}`,
          socket: {} as any,
          protocol: {},
        },
        request: {
          requestId: `request-${Date.now()}-${Math.random()}`,
          client: {
            req,
            res,
          },
          upstream: {},
          target: {
            originalUrl: req.url,
            originalHost: req.headers.host,
          },
        },
        lifecycle: {
          state: {
            values: new Map<string, any>(),
            set(key: string, value: any) {
              this.values.set(key, value);
            },
            get(key: string) {
              return this.values.get(key);
            },
          },
          isHijacked: false,
          timestamps: {
            receivedAt: Date.now(),
          },
          nextPhase: "response",
        },
      } as any;
    };

    const config = {
      useResponseCache: true,
    } as any;

    it("should return false when there is no cached response", () => {
      const res = createResponse();
      const scope = createScope(res);

      const processor = new ResponseCacheProcessor(scope, config);

      assert.equal(processor.tryServeHit(), false);
      assert.equal(res.writeHeadCalled, false);
      assert.equal(res.endCalled, false);
    });

    it("should serve a valid cached response", () => {
      const res = createResponse();
      const scope = createScope(res);

      const key = ResponseCache.generateKey(scope.request.client.req);

      const cachedResponse = {
        status: 200,
        headers: {
          "content-type": "application/json",
          connection: "keep-alive",
          etag: "abc",
        },
        body: Buffer.from('{"cached":true}'),
        expires: Date.now() + 60_000,
      };

      ResponseCache.set(key, cachedResponse);

      const processor = new ResponseCacheProcessor(scope, config);

      assert.equal(processor.tryServeHit(), true);

      assert.equal(res.writeHeadCalled, true);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.responseHeaders, {
        "content-type": "application/json",
        etag: "abc",
      });
      assert.equal(res.endCalled, true);
      assert.deepEqual(res.body, cachedResponse.body);

      assert.equal(scope.lifecycle.state.get("response.cacheHit"), true);

      assert.equal(scope.lifecycle.state.get("request.finished"), true);

      assert.equal(scope.lifecycle.nextPhase, undefined);

      ResponseCache.delete(key);
    });

    it("should return false for an expired cached response", () => {
      const res = createResponse();
      const scope = createScope(res);

      const key = ResponseCache.generateKey(scope.request.client.req);

      ResponseCache.set(key, {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
        body: Buffer.from("expired"),
        expires: Date.now() - 1,
      });

      const processor = new ResponseCacheProcessor(scope, config);

      assert.equal(processor.tryServeHit(), false);
      assert.equal(ResponseCache.get(key), undefined);

      ResponseCache.delete(key);
    });

    it("should return true when the client response is already ended", () => {
      const res = createResponse();
      res.writableEnded = true;

      const scope = createScope(res);

      const key = ResponseCache.generateKey(scope.request.client.req);

      ResponseCache.set(key, {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
        body: Buffer.from("cached"),
        expires: Date.now() + 60_000,
      });

      const processor = new ResponseCacheProcessor(scope, config);

      assert.equal(processor.tryServeHit(), true);
      assert.equal(res.endCalled, false);

      ResponseCache.delete(key);
    });

    it("should return false when response headers were already sent", () => {
      const res = createResponse();
      res.headersSent = true;

      const scope = createScope(res);

      const key = ResponseCache.generateKey(scope.request.client.req);

      ResponseCache.set(key, {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
        body: Buffer.from("cached"),
        expires: Date.now() + 60_000,
      });

      const processor = new ResponseCacheProcessor(scope, config);

      assert.equal(processor.tryServeHit(), false);
      assert.equal(res.endCalled, false);

      ResponseCache.delete(key);
    });
  });

  describe("tryServeRevalidation()", () => {
    const createResponse = () => {
      const response: any = {
        headersSent: false,
        writableEnded: false,
        endCalled: false,

        writeHead(status: number, headers: Record<string, any>) {
          response.statusCode = status;
          response.responseHeaders = headers;
        },

        end(body: Buffer) {
          response.endCalled = true;
          response.body = body;
        },
      };

      return response;
    };

    const createScope = (res: any) => {
      const req = {
        method: "GET",
        url: "/cached",
        headers: {
          host: "example.com",
          "accept-encoding": "gzip",
        },
      } as any;

      return {
        session: {
          connectionId: `revalidation-${Date.now()}-${Math.random()}`,
          socket: {} as any,
          protocol: {},
        },
        request: {
          requestId: `request-${Date.now()}-${Math.random()}`,
          client: {
            req,
            res,
          },
          upstream: {},
          target: {
            originalUrl: req.url,
            originalHost: req.headers.host,
          },
        },
        lifecycle: {
          state: {
            values: new Map<string, any>(),
            set(key: string, value: any) {
              this.values.set(key, value);
            },
            get(key: string) {
              return this.values.get(key);
            },
          },
          isHijacked: false,
          timestamps: {
            receivedAt: Date.now(),
          },
          nextPhase: "response",
        },
      } as any;
    };

    const config = {
      useResponseCache: true,
    } as any;

    it("should serve the cached response when upstream returns 304", () => {
      const res = createResponse();
      const scope = createScope(res);

      const key = ResponseCache.generateKey(scope.request.client.req);

      const cachedBody = Buffer.from('{"cached":true}');

      ResponseCache.set(key, {
        status: 200,
        headers: {
          "content-type": "application/json",
          etag: "old-etag",
        },
        body: cachedBody,
        expires: Date.now() + 60_000,
      });

      const upstreamRes: any = {
        statusCode: 304,
        headers: {
          "cache-control": "max-age=120",
          expires: new Date(Date.now() + 120_000).toUTCString(),
        },
        destroyed: false,
        destroy() {
          upstreamRes.destroyed = true;
        },
      };

      const processor = new ResponseCacheProcessor(scope, config);

      assert.equal(processor.tryServeRevalidation(upstreamRes), true);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, cachedBody);

      assert.equal(upstreamRes.destroyed, true);

      assert.equal(scope.lifecycle.state.get("response.cacheHit"), true);

      assert.equal(scope.lifecycle.state.get("request.finished"), true);

      assert.equal(scope.lifecycle.nextPhase, undefined);

      ResponseCache.delete(key);
    });

    it("should return false when there is no cached response", () => {
      const res = createResponse();
      const scope = createScope(res);

      const upstreamRes: any = {
        statusCode: 304,
        headers: {},
        destroyed: false,
        destroy() {},
      };

      const processor = new ResponseCacheProcessor(scope, config);

      assert.equal(processor.tryServeRevalidation(upstreamRes), false);
    });

    it("should return false when upstream response is not 304", () => {
      const res = createResponse();
      const scope = createScope(res);

      const key = ResponseCache.generateKey(scope.request.client.req);

      ResponseCache.set(key, {
        status: 200,
        headers: {},
        body: Buffer.from("cached"),
        expires: Date.now() + 60_000,
      });

      const upstreamRes: any = {
        statusCode: 200,
        headers: {},
        destroyed: false,
        destroy() {},
      };

      const processor = new ResponseCacheProcessor(scope, config);

      assert.equal(processor.tryServeRevalidation(upstreamRes), false);

      ResponseCache.delete(key);
    });

    it("should not overwrite a response whose headers were already sent", () => {
      const res = createResponse();
      res.headersSent = true;

      const scope = createScope(res);

      const key = ResponseCache.generateKey(scope.request.client.req);

      ResponseCache.set(key, {
        status: 200,
        headers: {},
        body: Buffer.from("cached"),
        expires: Date.now() + 60_000,
      });

      const upstreamRes: any = {
        statusCode: 304,
        headers: {},
        destroyed: false,
        destroy() {
          upstreamRes.destroyed = true;
        },
      };

      const processor = new ResponseCacheProcessor(scope, config);

      assert.equal(processor.tryServeRevalidation(upstreamRes), false);

      assert.equal(upstreamRes.destroyed, true);
      assert.equal(res.statusCode, undefined);

      ResponseCache.delete(key);
    });

    it("should serve cached body when upstream returns 304", () => {
      const res = createResponse();
      const scope = createScope(res);

      const key = ResponseCache.generateKey(scope.request.client.req!);

      ResponseCache.set(key, {
        status: 200,
        headers: {
          "content-type": "application/json",
          etag: '"abc"',
        },
        etag: '"abc"',
        body: Buffer.from('{"cached":true}'),
        expires: Date.now() + 60_000,
      });

      const processor = new ResponseCacheProcessor(scope, {
        useResponseCache: true,
      } as any);

      const upstreamRes = {
        statusCode: 304,
        headers: {
          etag: '"abc"',
          "cache-control": "max-age=60",
        },
        destroyed: false,
        destroy() {
          this.destroyed = true;
        },
      } as any;

      const result = processor.tryServeRevalidation(upstreamRes);
      assert.equal(result, true);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, Buffer.from('{"cached":true}'));
      assert.equal(res.endCalled, true);
      assert.equal(upstreamRes.destroyed, true);

      assert.equal(scope.lifecycle.state.get("response.cacheHit"), true);

      assert.equal(scope.lifecycle.state.get("request.finished"), true);

      assert.equal(scope.lifecycle.nextPhase, undefined);

      ResponseCache.delete(key);
    });
    it("should not serve revalidation when client response headers are already sent", () => {
      const res = createResponse();
      res.headersSent = true;

      const scope = createScope(res);

      const processor = new ResponseCacheProcessor(scope, {
        useResponseCache: true,
      } as any);

      (processor as any).cachedRes = {
        headers: {},
        body: Buffer.from(""),
        expires: 0,
      } as any;

      const upstreamRes = {
        statusCode: 304,
        headers: {},
        destroyed: false,

        destroy() {
          this.destroyed = true;
        },
      } as any;

      const result = processor.tryServeRevalidation(upstreamRes);

      assert.equal(result, false);
      console.info("DESTROYED:", upstreamRes.destroyed);
      assert.equal(upstreamRes.destroyed, true);
    });

    it("should not serve revalidation when client response has already ended", () => {
      const res = createResponse();
      res.writableEnded = true;

      const scope = createScope(res);

      const processor = new ResponseCacheProcessor(scope, {
        useResponseCache: true,
      } as any);

       (processor as any).cachedRes = {
         headers: {},
         body: Buffer.from(""),
         expires: 0,
       } as any;


      const upstreamRes = {
        statusCode: 304,
        headers: {},
        destroyed: false,

        destroy() {
          this.destroyed = true;
        },
      } as any;

      const result = processor.tryServeRevalidation(upstreamRes);

      assert.equal(result, false);
      assert.equal(upstreamRes.destroyed, true);
    });
  });

  describe("response interception", () => {
    const createRequest = (headers: Record<string, string> = {}) =>
      ({
        method: "GET",
        url: "/resource",
        headers: {
          host: "example.com",
          ...headers,
        },
      }) as any;

    const createResponse = (
      statusCode: number,
      headers: Record<string, string> = {},
    ) =>
      ({
        statusCode,
        headers,
      }) as any;

    const createScope = (req: any) =>
      ({
        session: {
          connectionId: `cache-${Date.now()}-${Math.random()}`,
          socket: {} as any,
          protocol: {},
        },
        request: {
          requestId: `request-${Date.now()}-${Math.random()}`,
          client: {
            req,
            res: {} as any,
          },
          upstream: {},
          target: {
            originalUrl: req.url,
            originalHost: req.headers.host,
          },
        },
        lifecycle: {
          state: {} as any,
          isHijacked: false,
          timestamps: {
            receivedAt: Date.now(),
          },
        },
      }) as any;

    const config = {
      useResponseCache: true,
    } as any;

    it("should initialize caching for a cacheable response", () => {
      const req = createRequest();

      const scope = createScope(req);
      const processor = new ResponseCacheProcessor(scope, config);

      const upstreamRes = createResponse(200, {
        "content-type": "application/json",
        "content-length": "11",
      });

      processor.initializeUpstreamIntercept(upstreamRes);

      processor.trackChunk(Buffer.from("hello world"));
      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(req);
      const cached = ResponseCache.get(key);

      assert.ok(cached);
      assert.equal(cached.status, 200);
      assert.deepEqual(cached.body, Buffer.from("hello world"));

      ResponseCache.delete(key);
    });

    it("should not cache a non-cacheable response", () => {
      const req = createRequest();

      const scope = createScope(req);
      const processor = new ResponseCacheProcessor(scope, config);

      const upstreamRes = createResponse(500, {
        "content-type": "application/json",
        "content-length": "5",
      });

      processor.initializeUpstreamIntercept(upstreamRes);
      processor.trackChunk(Buffer.from("error"));
      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(req);

      assert.equal(ResponseCache.get(key), undefined);
    });

    it("should combine multiple response chunks before caching", () => {
      const req = createRequest();

      const scope = createScope(req);
      const processor = new ResponseCacheProcessor(scope, config);

      const upstreamRes = createResponse(200, {
        "content-type": "application/json",
        "content-length": "11",
      });

      processor.initializeUpstreamIntercept(upstreamRes);

      processor.trackChunk(Buffer.from("hello "));
      processor.trackChunk(Buffer.from("world"));

      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(req);
      const cached = ResponseCache.get(key);

      assert.ok(cached);
      assert.deepEqual(cached.body, Buffer.from("hello world"));

      ResponseCache.delete(key);
    });

    it("should abort caching when accumulated body exceeds 5MB", () => {
      const req = createRequest();

      const scope = createScope(req);
      const processor = new ResponseCacheProcessor(scope, config);

      const upstreamRes = createResponse(200, {
        "content-type": "application/json",
        "transfer-encoding": "chunked",
      });

      processor.initializeUpstreamIntercept(upstreamRes);

      processor.trackChunk(Buffer.alloc(5 * 1024 * 1024 + 1));

      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(req);

      assert.equal(ResponseCache.get(key), undefined);
    });

    it("should not cache after abort()", () => {
      const req = createRequest();

      const scope = createScope(req);
      const processor = new ResponseCacheProcessor(scope, config);

      const upstreamRes = createResponse(200, {
        "content-type": "application/json",
        "content-length": "5",
      });

      processor.initializeUpstreamIntercept(upstreamRes);

      processor.trackChunk(Buffer.from("hello"));
      processor.abort();
      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(req);

      assert.equal(ResponseCache.get(key), undefined);
    });

    it("should store response metadata when committing", () => {
      const req = createRequest();

      const scope = createScope(req);
      const processor = new ResponseCacheProcessor(scope, config);

      const expires = new Date(Date.now() + 60_000).toUTCString();

      const upstreamRes = createResponse(200, {
        "content-type": "application/json",
        "content-length": "5",
        etag: "abc123",
        "cache-control": "max-age=60",
        expires,
      });

      processor.initializeUpstreamIntercept(upstreamRes);
      processor.trackChunk(Buffer.from("hello"));
      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(req);
      const cached = ResponseCache.get(key);

      assert.ok(cached);
      assert.equal(cached.status, 200);
      assert.equal(cached.etag, "abc123");
      assert.deepEqual(cached.headers, upstreamRes.headers);
      assert.deepEqual(cached.body, Buffer.from("hello"));
      assert.ok(cached.expires > Date.now());

      ResponseCache.delete(key);
    });

    it("should not initialize caching when response cache is disabled", () => {
      const req = createRequest();

      const scope = createScope(req);

      const processor = new ResponseCacheProcessor(scope, {
        useResponseCache: false,
      } as any);

      const upstreamRes = createResponse(200, {
        "content-type": "application/json",
        "content-length": "5",
      });

      processor.initializeUpstreamIntercept(upstreamRes);
      processor.trackChunk(Buffer.from("hello"));
      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(req);

      assert.equal(ResponseCache.get(key), undefined);
    });

    it("should reject a response whose declared content-length exceeds 5MB", () => {
      const req = createRequest();

      const scope = createScope(req);
      const processor = new ResponseCacheProcessor(scope, config);

      const upstreamRes = createResponse(200, {
        "content-type": "application/json",
        "content-length": String(5 * 1024 * 1024 + 1),
      });

      processor.initializeUpstreamIntercept(upstreamRes);
      processor.trackChunk(Buffer.from("small body"));
      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(req);

      assert.equal(ResponseCache.get(key), undefined);
    });

    it("should allow a response exactly at the 5MB limit", () => {
      const req = createRequest();

      const scope = createScope(req);
      const processor = new ResponseCacheProcessor(scope, config);

      const body = Buffer.alloc(5 * 1024 * 1024);

      const upstreamRes = createResponse(200, {
        "content-type": "application/json",
        "content-length": String(body.length),
      });

      processor.initializeUpstreamIntercept(upstreamRes);
      processor.trackChunk(body);
      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(req);
      const cached = ResponseCache.get(key);

      assert.ok(cached);
      assert.equal(cached.body.length, 5 * 1024 * 1024);

      ResponseCache.delete(key);
    });
  });

  describe("lifecycle", () => {
    const createResponse = () => {
      const response: any = {
        headersSent: false,
        writableEnded: false,
        writeHeadCalled: false,
        endCalled: false,

        writeHead(status: number, headers: Record<string, any>) {
          response.writeHeadCalled = true;
          response.statusCode = status;
          response.responseHeaders = headers;
        },

        end(body: Buffer) {
          response.endCalled = true;
          response.body = body;
        },
      };

      return response;
    };

    const createScope = (res: any) => {
      const req = {
        method: "GET",
        url: "/cached",
        headers: {
          host: "example.com",
          "accept-encoding": "gzip",
        },
      } as any;

      return {
        session: {
          connectionId: `test-${Date.now()}-${Math.random()}`,
          socket: {} as any,
          protocol: {},
        },
        request: {
          requestId: `request-${Date.now()}-${Math.random()}`,
          client: {
            req,
            res,
          },
          upstream: {},
          target: {
            originalUrl: req.url,
            originalHost: req.headers.host,
          },
        },
        lifecycle: {
          state: {
            values: new Map<string, any>(),
            set(key: string, value: any) {
              this.values.set(key, value);
            },
            get(key: string) {
              return this.values.get(key);
            },
          },
          isHijacked: false,
          timestamps: {
            receivedAt: Date.now(),
          },
          nextPhase: "response",
        },
      } as any;
    };

    afterEach(() => {
      ResponseCache.delete(
        ResponseCache.generateKey({
          method: "GET",
          url: "/cached",
          headers: {
            host: "example.com",
            "accept-encoding": "gzip",
          },
        } as any),
      );
    });

    it("should do nothing when response caching is disabled", () => {
      const res = createResponse();

      const scope = createScope(res);

      const processor = new ResponseCacheProcessor(scope, {
        useResponseCache: false,
      } as any);

      const upstreamRes = {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
          "content-length": "2",
        },
      } as any;

      processor.initializeUpstreamIntercept(upstreamRes);
      processor.trackChunk(Buffer.from("{}"));
      processor.commit(upstreamRes);

      assert.equal(processor.tryServeHit(), false);
    });
    it("should buffer cacheable response chunks", () => {
      const res = createResponse();

      const scope = createScope(res);

      const processor = new ResponseCacheProcessor(scope, {
        useResponseCache: true,
      } as any);

      const upstreamRes = {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
          "content-length": "5",
        },
      } as any;

      processor.initializeUpstreamIntercept(upstreamRes);

      processor.trackChunk(Buffer.from("hel"));
      processor.trackChunk(Buffer.from("lo"));

      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(scope.request.client.req!);
      const cached = ResponseCache.get(key);

      assert.ok(cached);
      assert.equal(cached.body.toString(), "hello");
    });

    it("should not cache a response after abort", () => {
      const res = createResponse();

      const scope = createScope(res);

      const processor = new ResponseCacheProcessor(scope, {
        useResponseCache: true,
      } as any);

      const upstreamRes = {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
          "content-length": "5",
        },
      } as any;

      processor.initializeUpstreamIntercept(upstreamRes);
      processor.trackChunk(Buffer.from("hello"));

      processor.abort();
      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(scope.request.client.req!);

      assert.equal(ResponseCache.get(key), undefined);
    });

    it("should abort buffering when the response exceeds the memory limit", () => {
      const res = createResponse();

      const scope = createScope(res);

      const processor = new ResponseCacheProcessor(scope, {
        useResponseCache: true,
      } as any);

      const upstreamRes = {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
        },
      } as any;

      processor.initializeUpstreamIntercept(upstreamRes);

      processor.trackChunk(Buffer.alloc(5 * 1024 * 1024));
      processor.trackChunk(Buffer.from("x"));

      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(scope.request.client.req!);

      assert.equal(ResponseCache.get(key), undefined);
    });

    it("should clear buffered chunks and memory on abort", () => {
      const res = createResponse();

      const scope = createScope(res);

      const processor = new ResponseCacheProcessor(scope, {
        useResponseCache: true,
      } as any);

      const upstreamRes = {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
          "content-length": "5",
        },
      } as any;

      processor.initializeUpstreamIntercept(upstreamRes);
      processor.trackChunk(Buffer.from("hello"));

      processor.abort();

      processor.commit(upstreamRes);

      const key = ResponseCache.generateKey(scope.request.client.req!);

      assert.equal(ResponseCache.get(key), undefined);
    });
  });
});
