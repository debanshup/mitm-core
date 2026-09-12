import assert from "assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  WatchableRuleFile,
  type IRuleParser,
} from "../../../src/core/rule/ruleStore";

describe("WatchableRuleFile", () => {
  let tempDir: string;
  let stores: WatchableRuleFile<any>[] = [];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mitm-core-rules-"));
  });
  afterEach(() => {
    for (const store of stores) {
      store.destroy();
    }
    stores = [];
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  });

  const createParser = (): IRuleParser<string[]> => ({
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
  });

  const createStore = <T>(
    name: string,
    filePath: string,
    parser: IRuleParser<T>,
    defaultState: T,
  ) => {
    const store = new WatchableRuleFile(name, filePath, parser, defaultState);

    stores.push(store);

    return store;
  };

  it("should create the rule file when it does not exist", () => {
    const filePath = path.join(tempDir, "rules.txt");

    createStore("test-rules", filePath, createParser(), []);

    assert.equal(fs.existsSync(filePath), true);
  });

  it("should create parent directories when they do not exist", () => {
    const filePath = path.join(tempDir, "nested", "rules.txt");

    createStore("test-rules", filePath, createParser(), []);

    assert.equal(fs.existsSync(filePath), true);
  });

  it("should load rules from an existing file", () => {
    const filePath = path.join(tempDir, "rules.txt");

    fs.writeFileSync(filePath, "example.com\napi.example.com\n");

    const store = createStore("test-rules", filePath, createParser(), []);
    assert.equal(store.match("example.com"), true);
    assert.equal(store.match("api.example.com"), true);
    assert.equal(store.match("unknown.com"), false);
  });

  // it("should use the default state when the file is empty", () => {
  //     const filePath = path.join(tempDir, "rules.txt");
  //     const store = createStore("test-rules", filePath, createParser(), []);

  //     assert.equal(store.match("default-rule"), false);
  // });

  it("should expose the rule name and normalized file path", () => {
    const filePath = path.join(tempDir, "rules.txt");

    const store = createStore("test-rules", filePath, createParser(), []);

    assert.equal(store.name, "test-rules");

    assert.equal(store.filePath, path.normalize(filePath));
  });

  it("should append a formatted rule", () => {
    const filePath = path.join(tempDir, "rules.txt");

    const store = createStore("test-rules", filePath, createParser(), []);

    store.appendRule("  example.com  ");

    const content = fs.readFileSync(filePath, "utf8");

    assert.ok(content.includes("example.com"));
  });

  it("should not append the same rule twice", () => {
    const filePath = path.join(tempDir, "rules.txt");

    const store = createStore("test-rules", filePath, createParser(), []);

    store.appendRule("example.com");
    store.appendRule("example.com");

    const content = fs.readFileSync(filePath, "utf8");

    assert.equal(content.split("example.com").length - 1, 1);
  });

  it("should not append an already existing rule", () => {
    const filePath = path.join(tempDir, "rules.txt");

    fs.writeFileSync(filePath, "example.com\n");

    const store = createStore("test-rules", filePath, createParser(), []);

    store.appendRule("example.com");

    const content = fs.readFileSync(filePath, "utf8");

    assert.equal(content.split("example.com").length - 1, 1);
  });

  it("should do nothing when formatForSave is not provided", () => {
    const filePath = path.join(tempDir, "rules.txt");

    const parser: IRuleParser<string[]> = {
      parse(rawContent) {
        return rawContent.split(/\r?\n/).filter(Boolean);
      },

      match(rules, target) {
        return rules.includes(target);
      },
    };

    const store = createStore("test-rules", filePath, parser, []);

    store.appendRule("example.com");

    assert.equal(fs.readFileSync(filePath, "utf8"), "");
  });

  it("should reload rules when the file changes", async () => {
    const filePath = path.join(tempDir, "rules.txt");

    fs.writeFileSync(filePath, "initial.com\n");

    const store = createStore("test-rules", filePath, createParser(), []);

    assert.equal(store.match("initial.com"), true);
    assert.equal(store.match("updated.com"), false);

    fs.writeFileSync(filePath, "updated.com\n");

    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal(store.match("initial.com"), false);
    assert.equal(store.match("updated.com"), true);
  });
});
