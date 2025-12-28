import { LRUCache } from "lru-cache";
import path from "path";
import fs from "fs";
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

  private static addToFile(
    host: string,
    { key, cert }: { key: Buffer; cert: Buffer }
  ) {
    const dir = path.join(process.cwd(), "creds", host);
    const certPath = path.join(dir, "cert.crt");
    const keyPath = path.join(dir, "key.pem");
    fs.mkdirSync(dir, { recursive: true }); // recursively create dir
    fs.writeFileSync(certPath, cert);
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
  }

  private static delete(host: string) {
    this.cache.delete(host.toLowerCase());
  }
  public static async getCertFromCache(host: string) {
    // Synchronous LRU Cache Check
    if (this.isCached(host)) {
      console.info("cert and key available in cache for", host);
      return this.cache.get(host);
    }
    // Check for In-Flight Task

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
          this.addToFile(host, { key, cert });
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
