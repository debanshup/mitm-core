import { LRUCache } from "lru-cache";
import path from "path";
import fs from "fs";
import * as crypto from "crypto";
import { pool } from "../workers/pool/Worker_pool.ts";
export class CertCache {
  protected constructor() {}
  // inflite
  private static inFlight = new Map<
    string,
    Promise<{ key: Buffer; cert: Buffer }>
  >();

  private static cache = new LRUCache<string, { key: Buffer; cert: Buffer }>({
    max: 500,
    ttl: 1000 * 60 * 60 * 24,
  });
  private static isCached(host: string) {
    return this.cache.has(host.toLowerCase());
  }
  private static addToCache(
    host: string,
    { key, cert }: { key: Buffer; cert: Buffer }
  ) {
    this.cache.set(host.toLowerCase(), { key, cert });
  }

  public static addToFile(
    host: string,
    data: { key: string | Buffer; cert: string | Buffer }
  ) {
    const dir = path.join(process.cwd(), "creds", host);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const certPath = path.join(dir, "cert.crt");
    const keyPath = path.join(dir, "key.pem");

    // prevent collision
    const tempSuffix = crypto.randomBytes(4).toString("hex");
    const tempCertPath = `${certPath}.${tempSuffix}.tmp`;
    const tempKeyPath = `${keyPath}.${tempSuffix}.tmp`;

    try {
      // write data to the TEMPORARY files first
      fs.writeFileSync(tempCertPath, data.cert);
      fs.writeFileSync(tempKeyPath, data.key);

      // Rename temp files to the final destination
      // If the process crashes during write, the final 'cert.crt' remains
      // non-existent or holds the previous valid version.
      fs.renameSync(tempCertPath, certPath);
      fs.renameSync(tempKeyPath, keyPath);

      console.info(`[FS] Successfully persisted certs for ${host}`);
    } catch (err) {
      console.error(`[FS] Failed to save certs for ${host}:`, err);

      // Cleanup partial temp files if they exist
      [tempCertPath, tempKeyPath].forEach((p) => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      });
    }
  }

  private static delete(host: string) {
    this.cache.delete(host.toLowerCase());
  }
  public static async getCertFromCache(host: string) {
    // Synchronous LRU Cache Check
    if (this.isCached(host)) {
      console.info("[CACHE] cert and key available in cache for", host);
      return this.cache.get(host);
    }
    // Check for In-Flight Task
    // fix for thundering herd

    const existingTask = this.inFlight.get(host);
    if (existingTask) {
      console.info(`[Lock] Attaching to in-flight task for: ${host}`);
      return existingTask;
    }

    const task = (async () => {
      try {
        const certPath = path.join(
          process.cwd(),
          "creds",
          `${host}`,
          "cert.crt"
        );
        const keyPath = path.join(process.cwd(), "creds", `${host}`, "key.pem");
        // Check FileSystem
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
          console.info("cert and key available in fs for", host);
          const data = {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath),
          };
          this.addToCache(host, data);
          return data;
        } else {
          // generate
          console.info("generating cert and key for", host);
          const { cert, key } = await pool.run({ host });
          await this.addToFile(host, { key, cert });
          this.addToCache(host, { key, cert });
          return { key, cert };
        }
      } finally {
        // CLEANUP
        this.inFlight.delete(host);
      }
    })();
    // Register the task in the map before awaiting it
    this.inFlight.set(host, task);
    return task;
  }
}
