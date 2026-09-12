import assert from "assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { RuleEngine } from "../../../src/core/rule/RuleEngine";
import {
  type IRuleParser,
  WatchableRuleFile,
} from "../../../src/core/rule/ruleStore";

describe("RuleEngine", () => {
  let tempDir: string;
  let createdStores: WatchableRuleFile<any>[] = [];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mitm-core-engine-"));
  });

  afterEach(() => {
    for (const store of createdStores) {
      store.destroy();
    }

    createdStores = [];

    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  });

  class TestRuleEngine extends RuleEngine<string[]> {
    protected readonly ruleName = "test-rule";

    protected readonly rulePath = path.join(tempDir, "rules.txt");

    protected readonly parser: IRuleParser<string[]> = {
      parse(rawContent) {
        return rawContent
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
      },

      match(rules, target) {
        return rules.includes(target);
      },

      formatForSave(input) {
        return input.trim();
      },
    };

    protected readonly defaultState: string[] = [];
  }

  it("should create a rule engine instance", () => {
    const engine = RuleEngine.createRule(TestRuleEngine);

    assert.ok(engine instanceof TestRuleEngine);

    createdStores.push(engine.store);
  });

  it("should create and attach a rule store", () => {
    const engine = RuleEngine.createRule(TestRuleEngine);

    assert.ok(engine.store instanceof WatchableRuleFile);
    assert.equal(engine.store.name, "test-rule");

    createdStores.push(engine.store);
  });

  it("should register the created store by rule name", () => {
    const engine = RuleEngine.createRule(TestRuleEngine);

    const store = RuleEngine.getRuleStore("test-rule");

    assert.strictEqual(store, engine.store);

    createdStores.push(engine.store);
  });

  it("should return undefined for an unknown rule store", () => {
    assert.equal(RuleEngine.getRuleStore("does-not-exist"), undefined);
  });

  it("should initialize the store using the rule path", () => {
    const engine = RuleEngine.createRule(TestRuleEngine);

    assert.equal(
      engine.store.filePath,
      path.normalize(path.join(tempDir, "rules.txt")),
    );

    assert.equal(fs.existsSync(engine.store.filePath), true);

    createdStores.push(engine.store);
  });

  it("should use the configured parser through the attached store", () => {
    const engine = RuleEngine.createRule(TestRuleEngine);

    fs.writeFileSync(engine.store.filePath, "example.com\napi.example.com\n");

    // Allow the rule watcher to reload.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        assert.equal(engine.store.match("example.com"), true);

        assert.equal(engine.store.match("unknown.com"), false);

        createdStores.push(engine.store);
        resolve();
      }, 300);
    });
  });
});
