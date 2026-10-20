import { LRUCache } from "lru-cache";
import path from "path";
import fs from "fs";
import * as crypto from "crypto";
import { pool } from "../workers/pool/Worker_pool";
import { getConfig } from "../../config.registry";

export class CertificateCacheManager {
  protected constructor() {}

  // inFlight tracks Promises of raw buffers
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
    { key, cert }: { key: Buffer; cert: Buffer },
  ) {
    this.cache.set(host.toLowerCase(), { key, cert });
  }

  private static saveToFile(
    host: string,
    data: { key: string | Buffer; cert: string | Buffer },
    savingDir?: string,
  ) {
    const dir = savingDir
      ? path.join(savingDir, `${host}`)
      : path.join(getConfig().leafCacheDir!, `${host}`);

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
      fs.renameSync(tempCertPath, certPath);
      fs.renameSync(tempKeyPath, keyPath);
    } catch (err) {
      console.error(`[FS] Failed to save certs for ${host}:`, err);

      // Cleanup partial temp files if they exist
      [tempCertPath, tempKeyPath].forEach((p) => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      });
    }
  }

  private static deleteFromCache(host: string) {
    this.cache.delete(host.toLowerCase());
  }

  private static clearCache() {
    this.cache.clear();
  }

  public static async getLeafFromCache(
    host: string,
    caConfig: { key: any; cert: any },
    leafDir?: string,
  ): Promise<{ key: Buffer; cert: Buffer }> {
    if (this.isCached(host)) {
      return this.cache.get(host.toLowerCase())!;
    }
    // Check for In-Flight Task
    const existingTask = this.inFlight.get(host);
    if (existingTask) {
      return existingTask;
    }

    const task = (async () => {
      try {
        const dir = leafDir
          ? path.join(leafDir, `${host}`)
          : path.join(getConfig().leafCacheDir!, host);

        const certPath = path.join(dir, "cert.crt");
        const keyPath = path.join(dir, "key.pem");

        // Check FileSystem
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
          const data = {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath),
          };

          this.addToCache(host, data);
          return data;
        } else {
          // generate
          console.info("generating cert and key for", host);
          const { cert, key } = await pool.run({ host, caConfig });

          const safeData = {
            cert: Buffer.isBuffer(cert) ? cert : Buffer.from(cert),
            key: Buffer.isBuffer(key) ? key : Buffer.from(key),
          };

          this.saveToFile(host, safeData);
          this.addToCache(host, safeData);

          return safeData;
        }
      } finally {
        // CLEANUP
        this.inFlight.delete(host);
      }
    })();

    this.inFlight.set(host, task);
    return task;
  }
}
