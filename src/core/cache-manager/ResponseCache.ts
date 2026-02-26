import { LRUCache } from "lru-cache";
import type { CachedResponse } from "../types/types.ts";
import http, { type IncomingHttpHeaders } from "http";
export class ResponseCache {
  protected constructor() {}

  private static cache = new LRUCache<string, CachedResponse>({
    max: 500,
    maxSize: 50 * 1024 * 1024, // 50MB total cache size
    sizeCalculation: (value) => value.body.length || 1,
    ttl: 1000 * 60 * 5, // Default 5 minute TTL
  });

  private static CACHEABLE_STATUS_CODES = new Set([
    200, 203, 204, 206, 300, 301, 302, 307, 308, 404, 410,
  ]);

  static get(key: string) {
    return this.cache.get(key);
  }
  static set(key: string, value: CachedResponse) {
    // console.info(key);
    this.cache.set(key, value);
  }
  static generateKey(req: any) {
    const host = req.headers?.host;
    const encoding = req.headers["accept-encoding"] || "identity";
    // console.info(`${req.method}:${host}${req.url}`)
    return `${req.method}:${host}${req.url}:${encoding}`;
  }

 
  static isCacheableResponse(
    req: http.IncomingMessage,
    res: http.IncomingMessage,
    bodySize: number,
  ): boolean {
    // Method Check
    if (req.method !== "GET" && req.method !== "HEAD") {
      return false;
    }
    if (req.headers["authorization"]) {
      return false;
    }

    // Matrix / Long-Polling failsafe
    // If the server doesn't provide a content-length, it's likely a stream
    // or chunked transfer (like Server-Sent Events). Don't cache it.

    const reqAccept = (req.headers["accept"] || "").toLowerCase();
    const resContentType = (res.headers["content-type"] || "").toLowerCase();
    const reqUpgrade = (req.headers["upgrade"] || "").toLowerCase();

    // Block Server-Sent Events (SSE) and WebSockets
    if (
      reqAccept.includes("text/event-stream") ||
      resContentType.includes("text/event-stream") ||
      reqUpgrade.includes("websocket")
    ) {
      return false;
    }

    // Block open-ended streams, BUT allow valid 'chunked' transfers!
    const hasLength = !!res.headers["content-length"];
    const isChunked = res.headers["transfer-encoding"] === "chunked";

    if (!hasLength && !isChunked) {
      return false;
    }
    const status = res.statusCode || 0;
    if (!ResponseCache.CACHEABLE_STATUS_CODES.has(status)) return false;

    //  Cache-Control "no-store" Check (Privacy/Security)
    const cacheControl = (res.headers["cache-control"] || "").toLowerCase();
    if (
      cacheControl.includes("no-store") ||
      cacheControl.includes("no-cache") ||
      cacheControl.includes("private") ||
      cacheControl.includes("must-revalidate")
    ) {
      return false;
    }

    //   Size Guard
    const sizeLimit = 5 * 1024 * 1024; // 5MB
    if (bodySize > sizeLimit) return false;

    //  Content-Type Strategy
    const ct = res.headers["content-type"] || "";

    // Always cache Redirects and No-Content (even if body is 0)
    if (status >= 300 || status === 204) return true;

    // For 200 OK, be selective to save LRU space
    const isCachableType =
      // ct.includes("text/html") ||
      ct.includes("text/css") ||
      ct.includes("javascript") ||
      ct.includes("json") || // Added JSON for API heavy sites
      ct.startsWith("image/") ||
      ct.startsWith("font/"); // Added Fonts (essential for speed)

    return isCachableType;
  }

  static getExpirationTimestamp(
    headers: IncomingHttpHeaders,
    defaultTtlMs: number = 300000,
    host: string,
  ): number {
    const now = Date.now();

    const getNormalizedHeader = (key: string) => {
      const val = headers[key.toLowerCase()];

      return Array.isArray(val)
        ? val.join(", ").toLowerCase()
        : String(val || "").toLowerCase();
    };

    const cacheControl = getNormalizedHeader("cache-control");
    // console.info(cacheControl);
    if (cacheControl) {
      if (cacheControl.includes("no-store")) {
        return 0;
      }
      if (
        cacheControl.includes("no-cache") ||
        cacheControl.includes("must-revalidate")
      ) {
        return now; // revalidation
      }
      // max-age
      const sMaxAge = cacheControl.match(/s-maxage=(\d+)/);
      if (sMaxAge) {
        return now + parseInt(sMaxAge[1]!, 10) * 1000;
      }
      const maxAge = cacheControl.match(/max-age=(\d+)/);
      if (maxAge) {
        const seconds = parseInt(maxAge[1]!, 10);
        if (seconds === 0) return now;
        return now + seconds * 1000;
      }
    }

    // Expires header
    const expires = headers["expires"];
    if (expires) {
      const expiresDate = Date.parse(expires);
      if (!isNaN(expiresDate)) {
        // RFC: If Expires is in the past, it's already stale
        return Math.max(now, expiresDate);
      }
    }

    console.info("using fallback timestamp for", host);
    // Fallback TTL
    return now + defaultTtlMs;
  }

  static delete(key: string) {
    this.cache.delete(key);
  }
}
