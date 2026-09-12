import assert from "assert/strict";
import { PluginEventManager } from "../../../src/core/event/plugin-events/pluginEvents";

describe("PluginEventManager", () => {
  it("should resolve when there are no listeners", async () => {
    const manager = new PluginEventManager();

    await assert.doesNotReject(
      manager.emitAsync("proxy:client-connect", {
        scope: {} as any,
      }),
    );
  });

  it("should execute a listener", async () => {
    const manager = new PluginEventManager();

    let called = false;

    manager.on("proxy:client-connect", () => {
      called = true;
    });

    await manager.emitAsync("proxy:client-connect", {
      scope: {} as any,
    });

    assert.equal(called, true);
  });

  it("should execute multiple listeners in order", async () => {
    const manager = new PluginEventManager();

    const calls: number[] = [];

    manager.on("proxy:client-connect", async () => {
      calls.push(1);
    });

    manager.on("proxy:client-connect", async () => {
      calls.push(2);
    });

    manager.on("proxy:client-connect", async () => {
      calls.push(3);
    });

    await manager.emitAsync("proxy:client-connect", {
      scope: {} as any,
    });

    assert.deepEqual(calls, [1, 2, 3]);
  });

  it("should wait for each async listener before running the next", async () => {
    const manager = new PluginEventManager();

    const calls: string[] = [];

    manager.on("proxy:client-connect", async () => {
      calls.push("first-start");

      await new Promise((resolve) => setTimeout(resolve, 20));

      calls.push("first-end");
    });

    manager.on("proxy:client-connect", async () => {
      calls.push("second-start");
      calls.push("second-end");
    });

    await manager.emitAsync("proxy:client-connect", {
      scope: {} as any,
    });

    assert.deepEqual(calls, [
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ]);
  });

  it("should propagate a listener error", async () => {
    const manager = new PluginEventManager();

    const error = new Error("plugin failed");

    manager.on("proxy:client-connect", async () => {
      throw error;
    });

    await assert.rejects(
      manager.emitAsync("proxy:client-connect", {
        scope: {} as any,
      }),
      (received) => received === error,
    );
  });

  it("should stop executing subsequent listeners when a listener fails", async () => {
    const manager = new PluginEventManager();

    let secondCalled = false;

    manager.on("proxy:client-connect", async () => {
      throw new Error("first failed");
    });

    manager.on("proxy:client-connect", async () => {
      secondCalled = true;
    });

    await assert.rejects(
      manager.emitAsync("proxy:client-connect", {
        scope: {} as any,
      }),
    );

    assert.equal(secondCalled, false);
  });

  it("should allow disabling the plugin timeout", async () => {
    const manager = new PluginEventManager();

    manager.setPluginTimeout(0);

    let completed = false;

    manager.on("proxy:client-connect", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      completed = true;
    });

    await manager.emitAsync("proxy:client-connect", {
      scope: {} as any,
    });

    assert.equal(completed, true);
  });
});

describe("timeout handling", () => {
  it("should reject when a plugin exceeds the configured timeout", async () => {
    const manager = new PluginEventManager();

    manager.setPluginTimeout(20);

    manager.on("proxy:client-connect", async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const startedAt = Date.now();

    await assert.rejects(
      manager.emitAsync("proxy:client-connect", {
        scope: {} as any,
      }),
      (error: any) => {
        assert.equal(error.message, "PLUGIN_TIMEOUT");
        return true;
      },
    );

    const elapsed = Date.now() - startedAt;

    assert.ok(elapsed >= 15);
    assert.ok(elapsed < 80);
  });

  it("should allow a plugin to finish before the timeout", async () => {
    const manager = new PluginEventManager();

    manager.setPluginTimeout(100);

    let completed = false;

    manager.on("proxy:client-connect", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      completed = true;
    });

    await manager.emitAsync("proxy:client-connect", {
      scope: {} as any,
    });

    assert.equal(completed, true);
  });

  it("should stop before executing the next plugin after a timeout", async () => {
    const manager = new PluginEventManager();

    manager.setPluginTimeout(20);

    let secondCalled = false;

    manager.on("proxy:client-connect", async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    manager.on("proxy:client-connect", async () => {
      secondCalled = true;
    });

    await assert.rejects(
      manager.emitAsync("proxy:client-connect", {
        scope: {} as any,
      }),
      (error: any) => error.message === "PLUGIN_TIMEOUT",
    );

    assert.equal(secondCalled, false);
  });

  it("should propagate a PipelineAbortSignal without converting it to a plugin error", async () => {
    const manager = new PluginEventManager();

    manager.setPluginTimeout(100);

    const { PipelineAbortSignal } =
      await import("../../../src/core/signals/pipelineAbortSignal");

    manager.on("proxy:client-connect", async () => {
      throw new PipelineAbortSignal();
    });

    await assert.rejects(
      manager.emitAsync("proxy:client-connect", {
        scope: {} as any,
      }),
      (error) => {
        return (
          error instanceof PipelineAbortSignal ||
          (error as any)?.constructor?.name === "PipelineAbortSignal"
        );
      },
    );
  });

  it("should propagate normal plugin errors", async () => {
    const manager = new PluginEventManager();

    const error = new Error("plugin exploded");

    manager.on("proxy:client-connect", async () => {
      throw error;
    });

    await assert.rejects(
      manager.emitAsync("proxy:client-connect", {
        scope: {} as any,
      }),
      (received) => received === error,
    );
  });
});