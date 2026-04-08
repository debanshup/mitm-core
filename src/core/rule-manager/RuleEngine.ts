import path from "path";
import { type IRuleParser } from "./parser.ts";
import { WatchableRuleFile } from "./ruleStore.ts";

export class RuleEngine {
  private static stores = new Map<string, WatchableRuleFile<any>>();

  private static AUTO_BYPASS_TLS_ERRORS = [
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "CERTIFICATE_VERIFY_FAILED",
    "CERT_HAS_EXPIRED",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN",
    "ERR_CERT_AUTHORITY_INVALID",
    "ERR_CERT_COMMON_NAME_INVALID",
  ];

  /** Register a new rule file with a specific parser */
  public static register<T>(
    name: string,
    relativePath: string,
    parser: IRuleParser<T>,
    defaultState: T,
  ) {
    const fullPath = path.join(process.cwd(), relativePath);
    const store = new WatchableRuleFile<T>(
      name,
      fullPath,
      parser,
      defaultState,
    );
    this.stores.set(name, store);
  }

  public static match(storeName: string, target: string): boolean {
    const store = this.stores.get(storeName);
    if (!store) {
      console.warn(`Rule store '${storeName}' not found.`);
      return false;
    }
    return store.match(target);
  }

  public static shouldBypass(host: string): boolean {
    return this.match("tls-bypass", host);
  }

  public static saveHostToBypass(host: string, error?: Error, force?: boolean) {
    if (force) {
      const store = this.stores.get("tls-bypass");
      store?.appendRule(host);
    }
    if (!error || !this.AUTO_BYPASS_TLS_ERRORS.includes((error as any).code)) {
      return;
    }

    if (this.shouldBypass(host)) return;

    console.log(`Auto-bypassing host due to ${(error as any).code}: ${host}`);
    const store = this.stores.get("tls-bypass");
    store?.appendRule(host);
  }
}

// // ==========================================
// // Initialization / Bootstrapping
// // ==========================================

// // Example: Register an Ad-Blocker list using the faster Exact Match Parser
// RuleEngine.register(
//   "ad-block",
//   "rules/block.rules.txt",
//   new ExactMatchParser(),
//   new Set(),
// );
