import assert from "node:assert/strict";

import { BasePlugin } from "../../../src/core/plugin/BasePlugin";

class TestPlugin extends BasePlugin<"proxy:client-connect"> {
  readonly event = "proxy:client-connect" as const;

  runCalled = false;
  initCalled = false;
  cleanupCalled = false;

  run(payload: any): void {
    this.runCalled = true;
    assert.ok(payload);
  }

  async init(): Promise<void> {
    this.initCalled = true;
  }

  async cleanup(): Promise<void> {
    this.cleanupCalled = true;
  }
}

describe("BasePlugin", () => {
  it("should expose the concrete plugin class name", () => {
    const plugin = new TestPlugin();

    assert.equal(plugin.name, "TestPlugin");
  });

  it("should expose the configured event", () => {
    const plugin = new TestPlugin();

    assert.equal(plugin.event, "proxy:client-connect");
  });

  it("should execute the plugin run implementation", () => {
    const plugin = new TestPlugin();

    plugin.run({});

    assert.equal(plugin.runCalled, true);
  });

  it("should support the optional init lifecycle hook", async () => {
    const plugin = new TestPlugin();

    await plugin.init();

    assert.equal(plugin.initCalled, true);
  });

  it("should support the optional cleanup lifecycle hook", async () => {
    const plugin = new TestPlugin();

    await plugin.cleanup();

    assert.equal(plugin.cleanupCalled, true);
  });
});
