import fs from "fs";
import os from "os";
import path from "path";

/**
 * Defines the strategy for parsing, matching, and formatting rule files.
 * Implementations provide the domain-specific logic to interpret raw file data.
 */
export interface IRuleParser<T> {
  /** Parses raw file content into an internal rule format */
  parse(rawContent: string): T;
  /** Evaluates a target against the parsed rules */
  match(rules: T, target: string): boolean;
  /** Formats a string to be safely appended to the file (optional) */
  formatForSave?(input: string): string;
}

/**
 * A reactive file handler that watches a specific configuration file for changes.
 * It automatically reloads rules using a debounced approach when the file is modified,
 * and provides methods to query matches and safely persist new rules.
 */
export class WatchableRuleFile<T> {
  private rules: T;
  private reloadTimer: NodeJS.Timeout | null = null;
  private pendingSaves = new Set<string>();
  public readonly filePath: string;
  constructor(
    public readonly name: string,
    inputPath: string,
    private readonly parser: IRuleParser<T>,
    defaultState: T,
  ) {
    if (path.isAbsolute(inputPath)) {
      console.info("abs");
      this.filePath = path.normalize(inputPath);
      console.info(this.filePath)
    } else {
      console.info("rel");
      this.filePath = path.resolve(process.cwd(), inputPath);
    }

    this.rules = defaultState;
    this.init();
  }

  private init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, "");

    this.loadRules();

    fs.watch(this.filePath, (event) => {
      if (event === "change") this.triggerDebounce();
    });
  }

  private triggerDebounce() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.loadRules();
      console.debug(`[RULE_STORE] Reloaded: ${this.name}`);
    }, 200);
  }

  private loadRules() {
    this.pendingSaves.clear();
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      this.rules = this.parser.parse(raw);
    } catch (error) {
      console.error(`[RULE_LOAD_ERR] ${this.name}`, error);
    }
  }

  /**
   * Checks if the provided target string matches any of the currently loaded rules.
   * * @param target - The string to evaluate against the loaded rules.
   * @returns True if a match is found; otherwise, false.
   */
  public match(target: string): boolean {
    return this.parser.match(this.rules, target);
  }

  /**
   * Formats and appends a new rule to the configuration file.
   * * This method ensures the rule is formatted correctly via the parser, avoids
   * duplicate entries, and handles file I/O safely. File changes will trigger
   * an automatic reload via the internal watcher.
   * * @param input - The raw input data to be processed and appended to the file.
   */
  public appendRule(input: string): void {
    if (!this.parser.formatForSave || this.pendingSaves.has(input)) return;

    this.pendingSaves.add(input);
    const newRule = this.parser.formatForSave(input);

    try {
      const currentContent = fs.readFileSync(this.filePath, "utf-8");
      if (currentContent.includes(newRule)) return;

      fs.appendFileSync(this.filePath, `${os.EOL}${newRule}`);
      // fs.watch will trigger a reload automatically
    } catch (error) {
      console.error(`[AUTO_SAVE_ERR] ${this.name}`, error);
    }
  }
}
