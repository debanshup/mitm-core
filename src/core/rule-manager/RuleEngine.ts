import fs from "fs";
import os from "os";
import type { IncomingMessage } from "http";
import path from "path";
export class RuleEngine {
  protected constructor() {}
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

  private static bypassRule: RegExp[] = [];
  private static pendingAutoBypass = new Set<string>(); // to prevent race condition when same domain occurs multiple error in 200ms wait time
  private static reloadTimer: NodeJS.Timeout | null = null;

  static {
    this.init("rules/bypass.rules.txt");
    console.info(this.bypassRule);
  }

  private static init(fsPath: string) {
    const dir = path.dirname(fsPath);
    // console.info(dir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    this.load(fsPath);
    fs.watch(fsPath, (event, filename) => {
      if (event === "change") {
        this.triggerDebounce(fsPath);
      }
    });
  }

  private static triggerDebounce(fsPath: string) {
    if (RuleEngine.reloadTimer) clearTimeout(RuleEngine.reloadTimer);
    RuleEngine.reloadTimer = setTimeout(() => {
      RuleEngine.load(fsPath);
      console.info("Bypass rules reloaded");
    }, 200);
  }

  private static load(fsPath: string) {
    this.pendingAutoBypass.clear();
    const raw = fs.readFileSync(fsPath, "utf8");
    try {
      this.bypassRule = Array.from(
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
          console.error(`Invalid bypass regex skipped: "${l}"`);
          return [];
        }
      });
    } catch (error) {
      console.error(
        "Critical: Failed to parse bypass rules. Check for invalid regex syntax.",
      );
      this.bypassRule = [];
    }
  }

  public static shouldBypass(host: string) {
    return this.bypassRule.some((r) => r.test(host));
  }

  /**
   * @description
   * experimental-use with caution
   * @todo test
   * @param host
   * @param error
   * @returns
   */

  public static saveHostToBypass(host: string, error: Error) {
    if (!this.AUTO_BYPASS_TLS_ERRORS.includes((error as any).code)) {
      return;
    }

    if (this.shouldBypass(host) || this.pendingAutoBypass.has(host)) {
      return;
    }

    this.pendingAutoBypass.add(host);

    const escapedHost = host.replace(/\./g, "\\.");
    const newRule = `^(?:[a-z0-9-]+\\.)*${escapedHost}$`;

    try {
      const bypassFilePath = "rules/bypass.rules.txt";
      const currentFileContent = fs.readFileSync(bypassFilePath, "utf-8");
      if (currentFileContent.includes(newRule)) return;
      console.log(`Auto-bypassing host due to ${error["code"]}: ${host}`);
      fs.appendFileSync(bypassFilePath, `${os.EOL}${newRule}`);
    } catch (error) {
      console.error("Failed to auto-save bypass rule:", error);
    }
  }
}
