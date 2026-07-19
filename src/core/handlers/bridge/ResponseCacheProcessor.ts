import type { IncomingMessage } from "http";
import type { ProxyConfig } from "../../../lib/Proxy";
import {
  ResponseCache,
  type CachedResponse,
} from "../../cache-manager/ResponseCache";
import type { RequestScope } from "../../context-manager/types";

export class ResponseCacheProcessor {
  private cacheKey?: string;
  private cachedRes?: CachedResponse;
  private isCacheable = false;
  private responseChunks: Buffer[] = [];

  constructor(
    private scope: RequestScope,
    private config: ProxyConfig,
  ) {
    if (this.config.useResponseCache) {
      this.cacheKey = ResponseCache.generateKey(this.scope.requestContext.req);
      this.cachedRes = ResponseCache.get(this.cacheKey)!;
    }
  }

  /**
   * Sanitizes headers to avoid leaking transport-specific headers from cache
   */
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

  /**
   * Tries to serve a direct cache hit. Returns true if served.
   */
  public tryServeHit(): boolean {
    if (!this.config.useResponseCache || !this.cachedRes) return false;

    const { requestContext: reqCtx, lifecycle } = this.scope;
    if (Date.now() <= this.cachedRes.expires) {
      if (!reqCtx.res || reqCtx.res.headersSent || reqCtx.res.writableEnded) {
        return true;
      }
      const headers = ResponseCacheProcessor.sanitizeHeaders(
        this.cachedRes.headers,
      );
      reqCtx.res.writeHead(this.cachedRes.status, headers);
      reqCtx.res.end(this.cachedRes.body);

      lifecycle.state.set("responseCacheHit", true);
      lifecycle.state.set("isFinished", true);
      lifecycle.nextPhase = undefined;
      return true;
    } else {
      ResponseCache.delete(this.cacheKey!);
      this.cachedRes = undefined;
    }
    return false;
  }

  /**
   * Handles 304 Revalidation. Returns true if revalidated and served.
   */
  public tryServeRevalidation(upstreamRes: IncomingMessage): boolean {
    if (
      !this.config.useResponseCache ||
      !this.cachedRes ||
      upstreamRes.statusCode !== 304
    ) {
      return false;
    }

    const { requestContext: reqCtx, lifecycle } = this.scope;
    this.cachedRes.expires = ResponseCache.getExpirationTimestamp(
      upstreamRes.headers,
      30000,
      reqCtx.req?.headers.host!,
    );

    const headers = ResponseCacheProcessor.sanitizeHeaders({
      ...this.cachedRes.headers,
      "cache-control": upstreamRes.headers["cache-control"],
      expires: upstreamRes.headers["expires"],
    });

    if (!reqCtx.res!.headersSent && !reqCtx.res!.writableEnded) {
      reqCtx.res!.writeHead(200, headers);
      reqCtx.res!.end(this.cachedRes.body);
    }

    upstreamRes.destroy();
    lifecycle.state.set("isFinished", true);
    return true;
  }

  /**
   * Prepares the interceptor for an incoming fresh upstream response
   */
  public initializeUpstreamIntercept(upstreamRes: IncomingMessage): void {
    if (!this.config.useResponseCache) return;

    this.isCacheable = ResponseCache.isCacheableResponse(
      this.scope.requestContext.req!,
      upstreamRes,
      0,
    );
  }

  /**
   * Collects data chunks if the response is cacheable
   */
  public trackChunk(chunk: Buffer): void {
    if (this.isCacheable) {
      this.responseChunks.push(chunk);
    }
  }

  /**
   * Persists the accumulated data chunks to the cache backend
   */
  public commit(upstreamRes: IncomingMessage): void {
    if (this.config.useResponseCache && this.isCacheable && this.cacheKey) {
      const reqCtx = this.scope.requestContext;
      ResponseCache.set(this.cacheKey, {
        status: upstreamRes.statusCode!,
        headers: upstreamRes.headers,
        etag: upstreamRes.headers.etag || "",
        body: Buffer.concat(this.responseChunks),
        expires: ResponseCache.getExpirationTimestamp(
          upstreamRes.headers,
          30000,
          reqCtx.req?.headers.host!,
        ),
      });
    }
  }
}
