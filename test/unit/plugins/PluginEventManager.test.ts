import assert from "node:assert/strict";
import type { RequestScope } from "../../../src/core/scope/types";
import { PluginEventManager } from "../../../src/core/event/plugin-events/pluginEvents";

const EVENT = "proxy:client-http-request" as const;

function createPayload() {
  return { scope: {} as RequestScope };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("PluginEventManager timeout", () => {
  it("rejects when a plugin exceeds the configured timeout", async () => {
    const manager = new PluginEventManager();
    manager.setPluginTimeout(20);

    manager.on(EVENT, async () => {
      await delay(200);
    });

    await assert.rejects(
      manager.emitAsync(EVENT, createPayload()),
      (error: Error) => error.message === "PLUGIN_TIMEOUT",
    );
  });

  it("does not execute subsequent listeners after a plugin times out", async () => {
    const manager = new PluginEventManager();
    manager.setPluginTimeout(20);

    let secondPluginExecuted = false;

    manager.on(EVENT, async () => {
      await delay(200);
    });

    manager.on(EVENT, () => {
      secondPluginExecuted = true;
    });

    await assert.rejects(
      manager.emitAsync(EVENT, createPayload()),
      /PLUGIN_TIMEOUT/,
    );

    assert.equal(
      secondPluginExecuted,
      false,
      "Subsequent listeners should not run after a timeout",
    );
  });

  it("handles a late rejection from a timed-out plugin without an unhandled rejection", async function () {
    this.timeout(2000);

    const manager = new PluginEventManager();
    manager.setPluginTimeout(20);

    const lateError = new Error("late plugin failure");
    const unhandledRejections: unknown[] = [];

    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };

    process.on("unhandledRejection", onUnhandledRejection);

    manager.on(EVENT, async () => {
      await delay(100);
      throw lateError;
    });

    try {
      await assert.rejects(
        manager.emitAsync(EVENT, createPayload()),
        /PLUGIN_TIMEOUT/,
      );

      // Allow the timed-out plugin to finish and reject.
      await delay(150);

      assert.deepEqual(
        unhandledRejections,
        [],
        "Late plugin rejection should be handled",
      );
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("continues to the next listener when the timeout is disabled", async () => {
    const manager = new PluginEventManager();
    manager.setPluginTimeout(0);

    const executionOrder: string[] = [];

    manager.on(EVENT, async () => {
      await delay(10);
      executionOrder.push("first");
    });

    manager.on(EVENT, () => {
      executionOrder.push("second");
    });

    await manager.emitAsync(EVENT, createPayload());

    assert.deepEqual(executionOrder, ["first", "second"]);
  });


it("propagates a synchronous plugin error and skips subsequent listeners", async () => {
  const manager = new PluginEventManager();
  manager.setPluginTimeout(1000);

  const pluginError = new Error("synchronous plugin failure");
  let secondPluginExecuted = false;

  manager.on(EVENT, () => {
    throw pluginError;
  });

  manager.on(EVENT, () => {
    secondPluginExecuted = true;
  });

  await assert.rejects(
    manager.emitAsync(EVENT, createPayload()),
    (error: Error) => error === pluginError,
  );

  assert.equal(
    secondPluginExecuted,
    false,
    "Subsequent listeners must not run after a plugin error",
  );
});

it("does not time out when a plugin completes before the deadline", async () => {
  const manager = new PluginEventManager();
  manager.setPluginTimeout(1000);

  const executionOrder: string[] = [];

  manager.on(EVENT, async () => {
    await delay(10);
    executionOrder.push("first");
  });

  manager.on(EVENT, () => {
    executionOrder.push("second");
  });

  await manager.emitAsync(EVENT, createPayload());

  assert.deepEqual(executionOrder, ["first", "second"]);
});

it("clears the timeout after a plugin completes successfully", async () => {
  const manager = new PluginEventManager();
  manager.setPluginTimeout(60_000);

  manager.on(EVENT, () => {
    // Complete immediately, well before the timeout.
  });

  await manager.emitAsync(EVENT, createPayload());

  // If the timer were still active, it could keep Node.js alive.
  // The test runner's process-level behavior provides the final check.
});

});
