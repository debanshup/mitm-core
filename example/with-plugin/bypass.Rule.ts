import { RuleEngine, type IRuleParser } from "../../src/index";

export class BypassRuleParser implements IRuleParser<RegExp[]> {
  parse(raw: string): RegExp[] {
    return Array.from(
      new Set(
        raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#")),
      ),
    ).flatMap((l) => {
      try {
        return [new RegExp(l, "i")];
      } catch (error) {
        console.error(`Invalid regex skipped: "${l}"`);
        return [];
      }
    });
  }

  match(rules: RegExp[], target: string): boolean {
    return rules.some((r) => r.test(target));
  }

  formatForSave(host: string): string {
    const escapedHost = host.replace(/\./g, "\\.");
    return `^(?:[a-z0-9-]+\\.)*${escapedHost}$`;
  }
}
export class BypassRuleEngine extends RuleEngine<string[] | RegExp[]> {
  public readonly ruleName = "tls-bypass";
  public readonly rulePath = "rules/bypass.rules.txt";
  public readonly parser = new BypassRuleParser();
  public readonly defaultState: string[] = [];

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

  public match(storeName: string, target: string): boolean {
    const store = RuleEngine.getRuleStore(storeName);
    if (!store) {
      console.warn(`Rule store '${storeName}' not found.`);
      return false;
    }
    return store.match(target);
  }

  public shouldBypass(host: string): boolean {
    return this.match("tls-bypass", host);
  }

  public saveHostToBypass(host: string, error?: Error, force?: boolean) {
    if (this.shouldBypass(host)) return;
    const errorCode = error ? (error as any).code : undefined;
    const isAutoBypassError =
      errorCode && BypassRuleEngine.AUTO_BYPASS_TLS_ERRORS.includes(errorCode);

    if (!force && !isAutoBypassError) {
      return;
    }
    if (!force) {
      console.log(`Auto-bypassing host due to ${errorCode}: ${host}`);
    } else {
      console.log(`Forcibly bypassing host: ${host}`);
    }
    this.store.appendRule(host);
  }
}
