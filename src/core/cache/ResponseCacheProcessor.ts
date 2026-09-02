import type { IncomingMessage } from "http";
import type { ProxyConfig } from "../../lib/Proxy";
import {
  ResponseCache,
  type CachedResponse,
} from "./ResponseCache";
import type { RequestScope } from "../scope/types";

// Prevent V8 OOM crashes if a stream is infinitely large
const MAX_CACHE_MEMORY_LIMIT = 5 * 1024 * 1024; // 5MB limit per response

export class ResponseCacheProcessor {
  private isCacheable = false;
  private cacheKey?: string;
  private cachedRes?: CachedResponse;
  private responseChunks: Buffer[] = [];
  private accumulatedBytes = 0; // Tracks memory size dynamically

  constructor(
    private scope: RequestScope,
    private config: ProxyConfig,
  ) {
    if (this.config.useResponseCache) {
      this.cacheKey = ResponseCache.generateKey(this.scope.request.client.req!);
      this.cachedRes = ResponseCache.get(this.cacheKey)!;
    }
  }

  public static sanitizeHeaders(
    headers: Record<string, any>,
  ): Record<string, any> {
    const ALLOW = new Set([
      "content-type",
      "content-encoding",
      "etag",
      "last-modified",
      "cache-control",
      "expires",
      "vary",
      "access-control-allow-origin",
      "access-control-allow-methods",
      "access-control-allow-headers",
      "access-control-expose-headers",
    ]);

    const clean: Record<string, any> = {};
    for (const key of Object.keys(headers)) {
      const lowerKey = key.toLowerCase();
      if (ALLOW.has(lowerKey)) {
        const val = headers[key];
        clean[lowerKey] = Array.isArray(val) ? val.join(", ") : val;
      }
    }
    return clean;
  }

  public tryServeHit(): boolean {
    if (!this.config.useResponseCache || !this.cachedRes) return false;

    const { request, lifecycle } = this.scope;
    const res = request.client.res;

    if (Date.now() <= this.cachedRes.expires) {
      // FIX: If socket is closed, we technically "handled" it by doing nothing.
      if (!res || res.writableEnded) {
        return true;
      }

      // FIX: If headers are already sent, we CANNOT serve a cache hit safely.
      // We must bail out and let the upstream request handle the broken state.
      if (res.headersSent) {
        return false;
      }

      const headers = ResponseCacheProcessor.sanitizeHeaders(
        this.cachedRes.headers,
      );
      res.writeHead(this.cachedRes.status, headers);
      res.end(this.cachedRes.body);

      lifecycle.state.set("response.cacheHit", true);
      lifecycle.state.set("request.finished", true);
      lifecycle.nextPhase = undefined;
      return true;
    } else {
      ResponseCache.delete(this.cacheKey!);
      this.cachedRes = undefined;
    }
    return false;
  }

  public tryServeRevalidation(upstreamRes: IncomingMessage): boolean {
    if (
      !this.config.useResponseCache ||
      !this.cachedRes ||
      upstreamRes.statusCode !== 304
    ) {
      return false;
    }

    const { request, lifecycle } = this.scope;
    const req = request.client.req;
    const res = request.client.res;

    if (!req || !res) return false;

    // FIX: Guard against partial states that would cause a hanging client
    if (res.headersSent || res.writableEnded) {
      // If we got a 304 but the client socket is already half-written,
      // we are in a corrupted state. Best to kill the upstream and return false.
      if (!upstreamRes.destroyed) upstreamRes.destroy();
      return false;
    }

    this.cachedRes.expires = ResponseCache.getExpirationTimestamp(
      upstreamRes.headers,
      30000,
    );

    const headers = ResponseCacheProcessor.sanitizeHeaders({
      ...this.cachedRes.headers,
      "cache-control": upstreamRes.headers["cache-control"],
      expires: upstreamRes.headers["expires"],
    });

    res.writeHead(200, headers);
    res.end(this.cachedRes.body);

    if (!upstreamRes.destroyed) upstreamRes.destroy();

    lifecycle.state.set("response.cacheHit", true);
    lifecycle.state.set("request.finished", true);
    lifecycle.nextPhase = undefined;

    return true;
  }

  public initializeUpstreamIntercept(upstreamRes: IncomingMessage): void {
    if (!this.config.useResponseCache) return;

    const req = this.scope.request.client.req;
    if (!req) return;

    this.isCacheable = ResponseCache.isCacheableResponse(req, upstreamRes, 0);

    // BAAILOUT: Don't even attempt to buffer if Content-Length explicitly exceeds our limit
    const cl = parseInt(upstreamRes.headers["content-length"] || "0", 10);
    if (this.isCacheable && cl > MAX_CACHE_MEMORY_LIMIT) {
      this.isCacheable = false;
    }
  }

  public trackChunk(chunk: Buffer): void {
    if (!this.isCacheable) return;

    this.accumulatedBytes += chunk.length;

    // BAILOUT: If stream lacks Content-Length but exceeds memory limit dynamically
    if (this.accumulatedBytes > MAX_CACHE_MEMORY_LIMIT) {
      this.abort();
      return;
    }

    this.responseChunks.push(chunk);
  }

  /**
   * Added to allow handlers to safely clear memory on failed/aborted streams
   */
  public abort(): void {
    this.isCacheable = false;
    this.responseChunks = [];
    this.accumulatedBytes = 0;
  }

  public commit(upstreamRes: IncomingMessage): void {
    if (this.config.useResponseCache && this.isCacheable && this.cacheKey) {
      const req = this.scope.request.client.req;
      if (!req) return;

      const body = Buffer.concat(this.responseChunks);

      ResponseCache.set(this.cacheKey, {
        status: upstreamRes.statusCode!,
        headers: upstreamRes.headers,
        etag: upstreamRes.headers.etag || "",
        body: body,
        expires: ResponseCache.getExpirationTimestamp(
          upstreamRes.headers,
          30000,
        ),
      });

      // Free local memory
      this.responseChunks = [];
    }
  }
}
