# Rule Engine

The `RuleEngine` API provides a foundation for building file-backed rule systems in `mitm-core`. It lets you define how rules are parsed, how targets are matched, and how new rules are formatted and persisted.

The rule store automatically creates its configuration file and parent directory when they do not exist. It loads the file at initialization and watches for changes, reloading the parsed rules after a short debounce.

## How it works

A rule system consists of three components:

- **`RuleEngine<T>`** — an abstract base class used to define a rule configuration and create its associated store.
- **`IRuleParser<T>`** — defines how raw file content is parsed, how targets are matched, and optionally how new rules are formatted for saving.
- **`WatchableRuleFile<T>`** — maintains the parsed rules, watches the configuration file, supports matching and appending rules, and manages watcher cleanup.

The general flow is:

1. Implement `IRuleParser<T>`.
2. Extend `RuleEngine<T>` and define its required properties.
3. Create the engine using `RuleEngine.createRule()`.
4. Use the associated store to match targets or append rules.
5. Call `destroy()` when the store is no longer needed.

## Creating a rule parser

Implement `IRuleParser<T>` to define the rule format and matching behavior.

```ts
import type { IRuleParser } from "mitm-core";

export class DomainRuleParser implements IRuleParser<string[]> {
  parse(rawContent: string): string[] {
    return rawContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  }

  match(rules: string[], target: string): boolean {
    return rules.includes(target);
  }

  formatForSave(input: string): string {
    return input.trim();
  }
}
```

The parser defines three operations:

| Method                 | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `parse(rawContent)`    | Converts the complete configuration file into a typed representation. |
| `match(rules, target)` | Determines whether a target matches the parsed rules.                 |
| `formatForSave(input)` | Optionally formats an input before it is appended to the file.        |

`formatForSave()` is optional. If it is not implemented, calling `appendRule()` does not write anything.

The example above performs exact string matching. More advanced parsers can use regular expressions, domain patterns, or other rule representations.

## Creating a rule engine

Extend `RuleEngine<T>` and provide its required properties.

```ts
import { RuleEngine, type IRuleParser } from "mitm-core";

class DomainRuleParser implements IRuleParser<string[]> {
  parse(rawContent: string): string[] {
    return rawContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  }

  match(rules: string[], target: string): boolean {
    return rules.includes(target);
  }

  formatForSave(input: string): string {
    return input.trim();
  }
}

class DomainRuleEngine extends RuleEngine<string[]> {
  protected readonly ruleName = "domain-rules";
  protected readonly rulePath = "./rules/domains.txt";
  protected readonly parser = new DomainRuleParser();
  protected readonly defaultState: string[] = [];
}
```

The engine properties define:

- `ruleName` — the name used to register and retrieve the associated store.
- `rulePath` — the configuration file path. Relative paths are resolved against the current working directory.
- `parser` — the implementation that parses and matches rules.
- `defaultState` — the initial parsed state used before the initial load or if parsing fails.

## Creating and using a rule store

Use `RuleEngine.createRule()` to instantiate the engine and initialize its associated store.

```ts
const engine = RuleEngine.createRule(DomainRuleEngine);

// Check a target.
const matches = engine.store.match("example.com");

// Append a rule to the file.
engine.store.appendRule("example.com");

// Release file-watcher resources when finished.
engine.store.destroy();
```

The store is available through the engine's `store` property.

### Matching rules

```ts
if (engine.store.match("example.com")) {
  console.log("Target matched a rule");
}
```

Matching uses the currently loaded parsed rules and the parser's `match()` implementation.

### Appending rules

```ts
engine.store.appendRule("example.com");
```

Appending a rule:

1. Does nothing if the parser does not implement `formatForSave()`.
2. Avoids repeated pending saves of the same input.
3. Formats the input using `formatForSave()`.
4. Checks whether the formatted rule already occurs in the file.
5. Appends the formatted rule if that check does not find it.

File I/O errors are logged rather than rethrown.

The duplicate check uses a substring search against the existing file content; it is not a semantic comparison of parsed rules.

### Automatic file reloads

The store creates the parent directory and file if needed, loads the initial contents, and watches the file for changes.

When a file-change event is received, the store waits 200 milliseconds before reloading the parsed rules. This debounce helps avoid repeatedly parsing the file during a burst of changes.

The current implementation watches for filesystem `change` events. It does not document a guarantee that every external file replacement or filesystem event will be detected on every platform.

### Destroying a store

```ts
engine.store.destroy();
```

This closes the file watcher and clears any pending reload timer. Call it when the store is no longer needed.

## Rule-store registry

`RuleEngine` maintains a shared registry of stores, keyed by `ruleName`.

```ts
const engine = RuleEngine.createRule(DomainRuleEngine);

const store = RuleEngine.getRuleStore("domain-rules");
```

`getRuleStore()` returns the registered store or `undefined` if no store has been registered under that name.

Creating another engine using the same `ruleName` replaces the registry entry for that name. Avoid reusing names when independent stores are intended.

## Example: TLS bypass rules

The repository includes an advanced example that uses a file-backed rule engine to manage TLS bypass rules:

- `example/advanced/rules/bypass.Rule.ts`
- `example/advanced/plugins/bypass.plugin.ts`

The example defines a parser that converts rule lines into regular expressions, checks whether a host matches, and formats hosts into patterns for persistence.

Its `BypassRuleEngine` exposes `shouldBypass(host)` and `saveHostToBypass(host, error?, force?)`. The latter supports automatic saving for a defined set of TLS certificate errors, or forced saving when requested.

See the [TLS bypass rule example](https://github.com/debanshup/mitm-core/blob/main/example/advanced/rules/bypass.Rule.ts) for the complete implementation.

## Important considerations

- **Rule paths:** Relative paths are resolved against `process.cwd()`, not automatically against the source file or package directory.
- **File access:** The store creates directories and files and reads and writes them synchronously.
- **Parsing failures:** A failed reload is logged; the previously loaded rule state remains in memory.
- **Duplicate detection:** `appendRule()` checks for an existing formatted string using substring matching, which can produce false positives in some rule formats.
- **Resource cleanup:** Call `destroy()` to release the watcher and pending timer.
- **Shared registry:** Store registration is keyed by `ruleName`; creating another store with the same name replaces the registry entry.

## Related Guides

- [Getting Started](./getting-started.md)
- [Configuration](./configuration.md)
- [Plugins](./plugins.md)
- [Proxy Events](./proxy-events.md)
- [Troubleshooting](./troubleshooting.md)
