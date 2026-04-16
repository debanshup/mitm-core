import fs from "fs";
import os from "os";
import path from "path";
export interface RuleParser<T> {
  /** Parses raw file content into an internal rule format */
  parse(rawContent: string): T;
  /** Evaluates a target against the parsed rules */
  match(rules: T, target: string): boolean;
  /** Formats a string to be safely appended to the file (optional) */
  formatForSave?(input: string): string;
}

export class WatchableRuleFile<T> {
  private rules: T;
  private reloadTimer: NodeJS.Timeout | null = null;
  private pendingSaves = new Set<string>();

  constructor(
    public readonly name: string,
    public readonly filePath: string,
    private readonly parser: RuleParser<T>,
    defaultState: T,
  ) {
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
      console.debug(
        `[Worker ${process.pid}] Rule Store '${this.name}' reloaded`,
      );
    }, 200);
  }

  private loadRules() {
    this.pendingSaves.clear();
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      this.rules = this.parser.parse(raw);
    } catch (error) {
      console.error(`Failed to load rules for '${this.name}':`, error);
    }
  }

  public match(target: string): boolean {
    return this.parser.match(this.rules, target);
  }

  public appendRule(input: string): void {
    if (!this.parser.formatForSave || this.pendingSaves.has(input)) return;

    this.pendingSaves.add(input);
    const newRule = this.parser.formatForSave(input);

    try {
      const currentContent = fs.readFileSync(this.filePath, "utf-8");
      if (currentContent.includes(newRule)) return;

      fs.appendFileSync(this.filePath, `${os.EOL}${newRule}`);
      // The fs.watch will trigger a reload automatically
    } catch (error) {
      console.error(`Failed to auto-save rule to '${this.name}':`, error);
    }
  }
}
