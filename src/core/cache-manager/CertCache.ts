import { LRUCache } from "lru-cache";

export class CertCache {
  private static cache = new LRUCache<string, { key: Buffer; cert: Buffer }>({
    max: 500,
    ttl: 1000 * 60 * 60 * 24
  });
  public static isCached(host: string) {
    return this.cache.has(host.toLowerCase());
  }
  public static addToCache(
    host: string,
    { key, cert }: { key: Buffer; cert: Buffer }
  ) {
    this.cache.set(host.toLowerCase(), { key, cert });
  }
  public static delete(host: string) {
    this.cache.delete(host.toLowerCase())
  }

  protected constructor(){}
}


/**
 * @use_here for fs-cache
 */
//   const certPath = path.join(process.cwd(), "creds", `${hostname}`, "cert.crt");
//   const keyPath = path.join(process.cwd(), "creds", `${hostname}`, "key.pem");

//   if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
//     console.info("cert already available");
//     return;
//   }
