export interface IRuleParser<T> {
  /** Parses raw file content into an internal rule format */
  parse(rawContent: string): T;
  /** Evaluates a target against the parsed rules */
  match(rules: T, target: string): boolean;
  /** Formats a string to be safely appended to the file (optional) */
  formatForSave?(input: string): string;
}

export class RegexRuleParser implements IRuleParser<RegExp[]> {
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

export class ExactMatchParser implements IRuleParser<Set<string>> {
  parse(raw: string): Set<string> {
    const lines = raw.split(/\r?\n/).map((l) => l.trim().toLowerCase());
    return new Set(lines.filter((l) => l && !l.startsWith("#")));
  }

  match(rules: Set<string>, target: string): boolean {
    return rules.has(target.toLowerCase());
  }

  formatForSave(host: string): string {
    return host.toLowerCase(); // Just append the raw host
  }
}
