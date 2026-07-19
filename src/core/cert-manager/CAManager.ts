import { getConfig } from "../../config.registry";
import { CertificateCacheManager } from "../cache-manager/CertificateCacheManager";
import { pool } from "../workers/pool/Worker_pool";

export class CAManager {
  static readonly config = getConfig();
  private static inFlight = new Map<
    string,
    Promise<{ key: Buffer; cert: Buffer }>
  >();

  static async getCA(host: string) {
    if (!this.config.rootCa) {
      throw Error("No CA Provided");
    }

    return await CertificateCacheManager.getCAFromCache(host, this.config.rootCa);
  }

  /**
   * Generates a new CA certificate and key for a given host, bypassing the cache.
   *
   * @param host - The target hostname.
   * @returns A promise that resolves to the generated certificate and private key buffers.
   */
  public static async generateCA(host: string) {
    const existingTask = this.inFlight.get(host);
    if (existingTask) return existingTask;

    const task = (async () => {
      try {
        const { cert, key } = await pool.run({
          host,
          caConfig: this.config.rootCa,
        });
        return { key, cert };
      } finally {
        this.inFlight.delete(host);
      }
    })();

    this.inFlight.set(host, task);
    return task;
  }
}
