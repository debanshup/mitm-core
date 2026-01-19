import { LRUCache } from "lru-cache";
import type { CachedResponse } from "../types/types.ts";
import http from "http";
export class ResponseCache {
  protected constructor() {}

  private static cache = new LRUCache<string, CachedResponse>({
    max: 500,
    maxSize: 50 * 1024 * 1024, // 50MB total cache size
    sizeCalculation: (value) => value.body.length || 1,
    ttl: 1000 * 60 * 5, // Default 5 minute TTL
  });

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

  /**
   * @test_and_fix_for_npm “Code” tab breaks
   */
  static isCacheableResponse(
    req: http.IncomingMessage,
    res: http.IncomingMessage,
    bodySize: number
  ): boolean {
    // 1. Method Check: Only idempotent safe methods
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    if (req.headers) {
    }
    // 2. Status Code Check: Use your whitelist!
    const CACHEABLE_STATUS_CODES = [
      200, 203, 204, 300, 301, 302, 307, 308, 404, 410,
    ];
    const status = res.statusCode || 0;
    if (!CACHEABLE_STATUS_CODES.includes(status)) return false;

    // 3. Cache-Control "no-store" Check (Privacy/Security)
    // If the server says 'no-store', a MITM proxy MUST NOT cache it.
    const cacheControl = res.headers["cache-control"] || "";
    if (cacheControl.includes("no-store") || cacheControl.includes("private")) {
      return false;
    }

    // 4. Size Guard
    const sizeLimit = 5 * 1024 * 1024; // 5MB
    if (bodySize > sizeLimit) return false;

    // 5. Content-Type Strategy
    const ct = res.headers["content-type"] || "";

    // Always cache Redirects and No-Content (even if body is 0)
    if (status >= 300 || status === 204) return true;

    // For 200 OK, be selective to save LRU space
    const isCachableType =
      ct.includes("text/html") ||
      ct.includes("text/css") ||
      ct.includes("javascript") ||
      ct.includes("json") || // Added JSON for API heavy sites
      ct.startsWith("image/") ||
      ct.startsWith("font/"); // Added Fonts (essential for speed)

    return isCachableType;
  }

  static getExpirationTimestamp(
    headers: any,
    defaultTtlMs: number = 300000
  ): number {
    const now = Date.now();

    const cacheControl = headers["cache-control"];
    if (cacheControl) {
      // max-age
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      if (maxAgeMatch) {
        return now + parseInt(maxAgeMatch[1], 10) * 1000;
      }

      // no-store blocks caching
      if (cacheControl.includes("no-store")) {
        return 0; // ⭐ **DO NOT CACHE**
      }

      // no-cache → expire immediately but keep entry
      if (cacheControl.includes("no-cache")) {
        return now; // requires revalidation
      }
    }

    // Expires header
    const expires = headers["expires"];
    if (expires) {
      const expiresDate = Date.parse(expires);
      if (!isNaN(expiresDate)) {
        return expiresDate;
      }
    }

    // Fallback TTL
    return now + defaultTtlMs;
  }

  static delete(key: string) {
    this.cache.delete(key);
  }
}
