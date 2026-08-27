import { getConfig } from "../../config.registry";
import { CertificateCacheManager } from "../cache/CertificateCacheManager";
import { pool } from "../workers/pool/Worker_pool";
import tls from "tls";
import { LRUCache } from "lru-cache";

export class CAManager {
  static readonly config = getConfig();

  private static ctxCache = new LRUCache<string, tls.SecureContext>({
    max: 500,
    ttl: 1000 * 60 * 60 * 24, // 24 hours
  });

  private static inFlight = new Map<string, Promise<tls.SecureContext>>();

  static async getCA(host: string): Promise<tls.SecureContext> {
    if (!this.config.rootCa) {
      throw Error("No CA Provided");
    }

    const cachedCtx = this.ctxCache.get(host);
    if (cachedCtx) return cachedCtx;

    const caConfig = await CertificateCacheManager.getCAFromCache(
      host,
      this.config.rootCa,
    );

    const { cert, key } = caConfig!;

    const ctx = tls.createSecureContext({ key, cert });
    this.ctxCache.set(host, ctx);

    return ctx;
  }

  /**
   * Generates a new CA certificate and key for a given host, bypassing the underlying cache.
   *
   * @param host - The target hostname.
   * @returns A promise that resolves to the instantiated SecureContext.
   */
  public static async generateCA(host: string): Promise<tls.SecureContext> {
    const existingTask = this.inFlight.get(host);
    if (existingTask) return existingTask;

    const task = (async () => {
      try {
        const { cert, key } = await pool.run({
          host,
          caConfig: this.config.rootCa,
        });

        const ctx = tls.createSecureContext({ key, cert });

        this.ctxCache.set(host, ctx);

        return ctx;
      } finally {
        this.inFlight.delete(host);
      }
    })();

    this.inFlight.set(host, task);
    return task;
  }
}
