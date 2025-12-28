import { CertCache } from "../cache-manager/CertCache.ts";
export class CertManager {
  static async getCert(host: string) {
    return await CertCache.getCertFromCache(host);
  }
}
