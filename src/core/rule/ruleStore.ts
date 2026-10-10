import fs from "fs";
import os from "os";
import path from "path";

/**
 * Defines the parsing, matching, and optional formatting operations
 * for a rule configuration.
 *
 * Implementations provide the logic for converting raw file content
 * into a typed rule representation, evaluating targets against those
 * rules, and formatting new rules for persistence.
 *
 * @typeParam T - The parsed representation of the rule configuration.
 */
export interface IRuleParser<T> {
  /**
   * Parses raw configuration file content into the rule representation.
   *
   * @param rawContent - The complete configuration file content.
   * @returns The parsed rule representation.
   */
  parse(rawContent: string): T;

  /**
   * Evaluates whether a target matches the parsed rules.
   *
   * @param rules - The parsed rules to evaluate.
   * @param target - The target string to check.
   * @returns `true` if the target matches the rules; otherwise, `false`.
   */
  match(rules: T, target: string): boolean;

  /**
   * Optionally formats an input value for appending to the rule file.
   *
   * Implementations can use this method to normalize or serialize
   * a new rule before it is persisted.
   *
   * @param input - The input value to format.
   * @returns The formatted rule string.
   */
  formatForSave?(input: string): string;
}

/**
 * Manages a rule configuration file and keeps its parsed state available
 * for matching and updates.
 *
 * Creates the parent directory and file when they do not exist, loads
 * the initial rules, and watches the file for changes. File-change events
 * trigger a debounced reload of the parsed rule state.
 *
 * Supports matching targets against the current rules, appending formatted
 * rules when the parser provides a formatter, and releasing watcher resources.
 *
 * @typeParam T - The parsed representation of the rule configuration.
 */
export class WatchableRuleFile<T> {
  private rules: T;
  private reloadTimer: NodeJS.Timeout | null = null;
  private pendingSaves = new Set<string>();
  private watcher?: fs.FSWatcher;
  /** Absolute, normalized path to the rule configuration file. */
  public readonly filePath: string;

  /**
   * Creates a rule-file store and initializes its file and watcher.
   *
   * Relative paths are resolved against the current working directory.
   * The supplied default state is assigned before the initial file load.
   *
   * @param name - Identifier used to associate the store with a rule engine.
   * @param inputPath - Path to the configuration file, absolute or relative.
   * @param parser - Parser used to load, match, and optionally format rules.
   * @param defaultState - Initial rule state used before or when loading
   *                       parsed file content fails.
   */
  constructor(
    public readonly name: string,
    inputPath: string,
    private readonly parser: IRuleParser<T>,
    defaultState: T,
  ) {
    if (path.isAbsolute(inputPath)) {
      this.filePath = path.normalize(inputPath);
      console.info(this.filePath);
    } else {
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

    this.watcher = fs.watch(this.filePath, (event) => {
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
   * Checks whether a target matches the currently loaded rules.
   *
   * @param target - The target string to evaluate.
   * @returns `true` if the parser reports a match; otherwise, `false`.
   */
  public match(target: string): boolean {
    return this.parser.match(this.rules, target);
  }

  /**
   * Formats and appends a rule to the configuration file.
   *
   * Does nothing if the parser does not provide `formatForSave()` or
   * the input is already present in the pending-save set. Before writing,
   * checks whether the formatted rule already occurs in the file.
   *
   * File changes are handled by the existing watcher and reload mechanism.
   * File I/O errors are logged rather than rethrown.
   *
   * @param input - Raw rule input to format and append.
   */
  public appendRule(input: string): void {
    if (!this.parser.formatForSave || this.pendingSaves.has(input)) return;

    this.pendingSaves.add(input);
    const newRule = this.parser.formatForSave(input);

    try {
      const currentContent = fs.readFileSync(this.filePath, "utf-8");
      if (currentContent.includes(newRule)) return;

      fs.appendFileSync(this.filePath, `${os.EOL}${newRule}`);
    } catch (error) {
      console.error(`[AUTO_SAVE_ERR] ${this.name}`, error);
    }
  }

  /**
   * Stops the file watcher and clears any pending reload timer.
   *
   * Call this when the store is no longer needed to release its
   * watcher and timer resources.
   */
  public destroy(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }

    this.watcher?.close();
    this.watcher = undefined;
  }
}
