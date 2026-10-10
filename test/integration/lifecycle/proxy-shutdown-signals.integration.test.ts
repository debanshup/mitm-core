import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "mocha";
import { Proxy } from "../../../src/lib/Proxy";

const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
type Signal = (typeof SIGNALS)[number];
type SignalHandler = (...args: any[]) => void;

describe("Proxy shutdown signal handlers", function () {
  let proxy: Proxy | undefined;
  let baselineListeners: Map<Signal, Function[]>;
  let originalExitCode: number | undefined;

  beforeEach(function () {
    proxy = undefined;
    originalExitCode = process.exitCode as any;

    baselineListeners = new Map(
      SIGNALS.map((signal) => [signal, process.listeners(signal)]),
    );
  });

  afterEach(async function () {
    try {
      if (proxy) {
        await proxy.stop();
      }
    } finally {
      // Remove only listeners added during this test.
      for (const signal of SIGNALS) {
        const baseline = baselineListeners.get(signal) ?? [];

        for (const listener of process.listeners(signal)) {
          if (!baseline.includes(listener)) {
            process.off(signal, listener as SignalHandler);
          }
        }
      }

      // The simulated SIGINT handler sets this after shutdown.
      process.exitCode = originalExitCode;
      proxy = undefined;
    }
  });

  it("should register signal handlers after successful startup and remove them on manual stop", async function () {
    proxy = new Proxy();

    await proxy.listen(0);

    const registeredHandlers = new Map<Signal, Function>();

    for (const signal of SIGNALS) {
      const added = process
        .listeners(signal)
        .filter(
          (listener) => !baselineListeners.get(signal)?.includes(listener),
        );

      assert.equal(
        added.length,
        1,
        `Expected one ${signal} handler after startup`,
      );

      registeredHandlers.set(signal, added[0]);
    }

    await proxy.stop();

    for (const signal of SIGNALS) {
      assert.equal(
        process
          .listeners(signal)
          .includes(registeredHandlers.get(signal) as any),
        false,
        `Expected ${signal} handler to be removed after stop`,
      );
    }

    assert.equal(proxy.address(), null);
  });

  it("should gracefully stop when the registered SIGINT handler fires", async function () {
    proxy = new Proxy();
    await proxy.listen(0);
    const sigintHandler = process
      .listeners("SIGINT")
      .find((listener) => !baselineListeners.get("SIGINT")?.includes(listener));

    assert.ok(sigintHandler, "Expected SIGINT handler to be registered");

    (sigintHandler as (...args: any[]) => void)();

    await proxy.stop();

    assert.equal(proxy.address(), null);

    for (const signal of SIGNALS) {
      const addedListeners = process
        .listeners(signal)
        .filter(
          (listener) => !baselineListeners.get(signal)?.includes(listener),
        );

      assert.equal(
        addedListeners.length,
        0,
        `Expected ${signal} listener to be cleaned up`,
      );
    }
  });
});
