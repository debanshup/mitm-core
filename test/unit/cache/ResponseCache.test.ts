import assert from "assert/strict";
import http, { type IncomingHttpHeaders } from "http";

import { ResponseCache } from "../../../src/core/cache/ResponseCache";

describe("ResponseCache", () => {
  describe("generateKey()", () => {
    const createRequest = (
      method: string,
      host: string,
      url: string,
      acceptEncoding?: string,
    ) =>
      ({
        method,
        url,
        headers: {
          host,
          ...(acceptEncoding !== undefined
            ? { "accept-encoding": acceptEncoding }
            : {}),
        },
      }) as http.IncomingMessage;

    it("should generate a stable key for the same request", () => {
      const req1 = createRequest("GET", "example.com", "/api/data", "gzip");

      const req2 = createRequest("GET", "example.com", "/api/data", "gzip");

      assert.equal(
        ResponseCache.generateKey(req1),
        ResponseCache.generateKey(req2),
      );
    });

    it("should include the request method", () => {
      const getReq = createRequest("GET", "example.com", "/resource", "gzip");

      const headReq = createRequest("HEAD", "example.com", "/resource", "gzip");

      assert.notEqual(
        ResponseCache.generateKey(getReq),
        ResponseCache.generateKey(headReq),
      );
    });

    it("should include the host", () => {
      const req1 = createRequest("GET", "example.com", "/resource", "gzip");

      const req2 = createRequest("GET", "other.com", "/resource", "gzip");

      assert.notEqual(
        ResponseCache.generateKey(req1),
        ResponseCache.generateKey(req2),
      );
    });

    it("should include the URL", () => {
      const req1 = createRequest("GET", "example.com", "/resource?a=1", "gzip");

      const req2 = createRequest("GET", "example.com", "/resource?a=2", "gzip");

      assert.notEqual(
        ResponseCache.generateKey(req1),
        ResponseCache.generateKey(req2),
      );
    });

    it("should include accept-encoding", () => {
      const req1 = createRequest("GET", "example.com", "/resource", "gzip");

      const req2 = createRequest("GET", "example.com", "/resource", "br");

      assert.notEqual(
        ResponseCache.generateKey(req1),
        ResponseCache.generateKey(req2),
      );
    });

    it("should default accept-encoding to identity", () => {
      const req = createRequest("GET", "example.com", "/resource");

      assert.equal(
        ResponseCache.generateKey(req),
        "GET:example.com/resource:identity",
      );
    });
  });

  describe("isCacheableResponse()", () => {
    const createRequest = (
      method = "GET",
      headers: Record<string, string> = {},
    ) =>
      ({
        method,
        headers,
      }) as http.IncomingMessage;

    const createResponse = (
      statusCode = 200,
      headers: Record<string, string> = {},
    ) =>
      ({
        statusCode,
        headers,
      }) as http.IncomingMessage;

    it("should allow GET responses with cacheable content", () => {
      const req = createRequest("GET", {
        accept: "application/json",
      });

      const res = createResponse(200, {
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), true);
    });

    it("should allow HEAD requests", () => {
      const req = createRequest("HEAD");

      const res = createResponse(200, {
        "content-type": "application/json",
        "content-length": "0",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 0), true);
    });

    it("should reject non-GET/HEAD methods", () => {
      const req = createRequest("POST");

      const res = createResponse(200, {
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should reject non-cacheable status codes", () => {
      const req = createRequest("GET");

      const res = createResponse(500, {
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should reject no-store responses", () => {
      const req = createRequest();

      const res = createResponse(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should reject no-cache responses", () => {
      const req = createRequest();

      const res = createResponse(200, {
        "cache-control": "no-cache",
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should reject private responses", () => {
      const req = createRequest();

      const res = createResponse(200, {
        "cache-control": "private",
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should reject vary: * responses", () => {
      const req = createRequest();

      const res = createResponse(200, {
        vary: "*",
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should reject responses larger than 5MB", () => {
      const req = createRequest();

      const res = createResponse(200, {
        "content-type": "application/json",
        "content-length": String(5 * 1024 * 1024 + 1),
      });

      assert.equal(
        ResponseCache.isCacheableResponse(req, res, 5 * 1024 * 1024 + 1),
        false,
      );
    });

    it("should reject SSE requests", () => {
      const req = createRequest("GET", {
        accept: "text/event-stream",
      });

      const res = createResponse(200, {
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should reject SSE responses", () => {
      const req = createRequest();

      const res = createResponse(200, {
        "content-type": "text/event-stream",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should reject WebSocket upgrades", () => {
      const req = createRequest("GET", {
        upgrade: "websocket",
      });

      const res = createResponse(200, {
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should reject responses without length or chunked encoding", () => {
      const req = createRequest();

      const res = createResponse(200, {
        "content-type": "application/json",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should allow chunked responses", () => {
      const req = createRequest();

      const res = createResponse(200, {
        "content-type": "application/json",
        "transfer-encoding": "chunked",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), true);
    });

    it("should allow authorization when response is explicitly public", () => {
      const req = createRequest("GET", {
        authorization: "Bearer token",
      });

      const res = createResponse(200, {
        "cache-control": "public, max-age=60",
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), true);
    });

    it("should reject authorization without explicit public caching", () => {
      const req = createRequest("GET", {
        authorization: "Bearer token",
      });

      const res = createResponse(200, {
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should allow cacheable 3xx responses", () => {
      const req = createRequest();

      const res = createResponse(301, {
        "content-length": "0",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 0), true);
    });

    it("should allow 204 responses", () => {
      const req = createRequest();

      const res = createResponse(204, {
        "content-length": "0",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 0), true);
    });
    it("should reject 200 responses with non-cacheable content type", () => {
      const req = createRequest();

      const res = createResponse(200, {
        "content-type": "text/plain",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), false);
    });

    it("should allow JSON responses", () => {
      const req = createRequest();

      const res = createResponse(200, {
        "content-type": "application/json",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), true);
    });

    it("should allow image responses", () => {
      const req = createRequest();

      const res = createResponse(200, {
        "content-type": "image/png",
        "content-length": "100",
      });

      assert.equal(ResponseCache.isCacheableResponse(req, res, 100), true);
    });
  });

  describe("getExpirationTimestamp()", () => {
    const now = Date.now();

    it("should use the default TTL when no cache headers are present", () => {
      const before = Date.now();

      const result = ResponseCache.getExpirationTimestamp({}, 30_000);

      const after = Date.now();

      assert.ok(result >= before + 30_000);
      assert.ok(result <= after + 30_000);
    });

    it("should use s-maxage when present", () => {
      const before = Date.now();

      const result = ResponseCache.getExpirationTimestamp(
        {
          "cache-control": "s-maxage=120",
        },
        30_000,
      );

      const after = Date.now();

      assert.ok(result >= before + 120_000);
      assert.ok(result <= after + 120_000);
    });

    it("should use max-age when present", () => {
      const before = Date.now();

      const result = ResponseCache.getExpirationTimestamp(
        {
          "cache-control": "max-age=60",
        },
        30_000,
      );

      const after = Date.now();

      assert.ok(result >= before + 60_000);
      assert.ok(result <= after + 60_000);
    });

    it("should immediately expire max-age=0", () => {
      const before = Date.now();

      const result = ResponseCache.getExpirationTimestamp({
        "cache-control": "max-age=0",
      });

      const after = Date.now();

      assert.ok(result >= before);
      assert.ok(result <= after);
    });

    it("should immediately expire no-cache responses", () => {
      const before = Date.now();

      const result = ResponseCache.getExpirationTimestamp({
        "cache-control": "no-cache",
      });

      const after = Date.now();

      assert.ok(result >= before);
      assert.ok(result <= after);
    });

    it("should immediately expire must-revalidate responses", () => {
      const before = Date.now();

      const result = ResponseCache.getExpirationTimestamp({
        "cache-control": "must-revalidate",
      });

      const after = Date.now();

      assert.ok(result >= before);
      assert.ok(result <= after);
    });

    it("should return 0 for no-store responses", () => {
      assert.equal(
        ResponseCache.getExpirationTimestamp({
          "cache-control": "no-store",
        }),
        0,
      );
    });

    it("should use a valid future Expires header", () => {
      const expires = new Date(Date.now() + 60_000).toUTCString();

      const result = ResponseCache.getExpirationTimestamp({
        expires,
      });

      assert.equal(result, Date.parse(expires));
    });

    it("should treat a past Expires header as immediately stale", () => {
      const past = new Date(Date.now() - 60_000).toUTCString();

      const before = Date.now();

      const result = ResponseCache.getExpirationTimestamp({
        expires: past,
      });

      const after = Date.now();

      assert.ok(result >= before);
      assert.ok(result <= after);
    });

    it("should handle array-valued cache-control headers", () => {
      const before = Date.now();

      const headers: IncomingHttpHeaders = {
        "cache-control": "public, max-age=60",
      };

      const result = ResponseCache.getExpirationTimestamp(headers);

      const after = Date.now();

      assert.ok(result >= before + 60_000);
      assert.ok(result <= after + 60_000);
    });
  });

  describe("storage", () => {
    const createCachedResponse = (
      overrides: Partial<{
        status: number;
        etag: string;
        headers: Record<string, string | string[] | undefined>;
        body: Buffer;
        expires: number;
      }> = {},
    ) => ({
      status: 200,
      etag: "etag-123",
      headers: {
        "content-type": "application/json",
      },
      body: Buffer.from("hello"),
      expires: Date.now() + 60_000,
      ...overrides,
    });

    it("should store and retrieve a cached response", () => {
      const key = `test:get:${Date.now()}`;
      const value = createCachedResponse();

      ResponseCache.set(key, value);

      const result = ResponseCache.get(key);

      assert.deepEqual(result, value);

      ResponseCache.delete(key);
    });

    it("should return undefined for a missing key", () => {
      const key = `missing:${Date.now()}`;

      assert.equal(ResponseCache.get(key), undefined);
    });

    it("should delete a cached response", () => {
      const key = `test:delete:${Date.now()}`;
      const value = createCachedResponse();

      ResponseCache.set(key, value);

      assert.deepEqual(ResponseCache.get(key), value);

      ResponseCache.delete(key);

      assert.equal(ResponseCache.get(key), undefined);
    });

    it("should replace an existing cached response with the same key", () => {
      const key = `test:replace:${Date.now()}`;

      const first = createCachedResponse({
        body: Buffer.from("first"),
        etag: "etag-first",
      });

      const second = createCachedResponse({
        body: Buffer.from("second"),
        etag: "etag-second",
      });

      ResponseCache.set(key, first);
      ResponseCache.set(key, second);

      const result = ResponseCache.get(key);

      assert.deepEqual(result, second);

      ResponseCache.delete(key);
    });

    it("should preserve Buffer response bodies", () => {
      const key = `test:buffer:${Date.now()}`;
      const body = Buffer.from([0, 1, 2, 255]);

      const value = createCachedResponse({ body });

      ResponseCache.set(key, value);

      const result = ResponseCache.get(key);

      assert.ok(result);
      assert.ok(Buffer.isBuffer(result.body));
      assert.deepEqual(result.body, body);

      ResponseCache.delete(key);
    });
  });
});
