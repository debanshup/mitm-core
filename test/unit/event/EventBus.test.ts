import assert from "assert/strict";
import { TypedEventEmitter } from "../../../src/core/event/EventBus";

interface TestEvents {
  message: [payload: { value: string }];
  done: [];
}

describe("TypedEventEmitter", () => {
  it("should register and emit a typed event", () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    let received: string | undefined;

    emitter.on("message", ({ value }) => {
      received = value;
    });

    emitter.emit("message", { value: "hello" });

    assert.equal(received, "hello");
  });

  it("should support multiple listeners", () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    const calls: string[] = [];

    emitter.on("message", () => {
      calls.push("first");
    });

    emitter.on("message", () => {
      calls.push("second");
    });

    emitter.emit("message", { value: "hello" });

    assert.deepEqual(calls, ["first", "second"]);
  });

  it("should execute listeners in registration order", () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    const calls: number[] = [];

    emitter.on("message", () => calls.push(1));
    emitter.on("message", () => calls.push(2));
    emitter.on("message", () => calls.push(3));

    emitter.emit("message", { value: "hello" });

    assert.deepEqual(calls, [1, 2, 3]);
  });

  it("should support once listeners", () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    let count = 0;

    emitter.once("message", () => {
      count++;
    });

    emitter.emit("message", { value: "first" });
    emitter.emit("message", { value: "second" });

    assert.equal(count, 1);
  });

  it("should remove a specific listener with off()", () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    let count = 0;

    const listener = () => {
      count++;
    };

    emitter.on("message", listener);
    emitter.off("message", listener);

    emitter.emit("message", { value: "hello" });

    assert.equal(count, 0);
  });

  it("should report whether listeners were invoked", () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    assert.equal(emitter.emit("message", { value: "hello" }), false);

    emitter.on("message", () => {});

    assert.equal(emitter.emit("message", { value: "hello" }), true);
  });

  it("should return registered listeners", () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    const listener = () => {};

    emitter.on("message", listener);

    const listeners = emitter.listeners("message");

    assert.equal(listeners.length, 1);
    assert.equal(listeners[0], listener);
  });

  it("should remove all listeners for an event", () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    let count = 0;

    emitter.on("message", () => count++);
    emitter.on("message", () => count++);

    emitter.removeAllListeners("message");

    emitter.emit("message", { value: "hello" });

    assert.equal(count, 0);
  });

  it("should resolve emitAsync when there are no listeners", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    await assert.doesNotReject(
      emitter.emitAsync("message", { value: "hello" }),
    );
  });

  it("should execute async listeners", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    let completed = false;

    emitter.on("message", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      completed = true;
    });

    await emitter.emitAsync("message", { value: "hello" });

    assert.equal(completed, true);
  });

  it("should execute async listeners concurrently", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    const order: string[] = [];

    emitter.on("message", async () => {
      order.push("first-start");

      await new Promise((resolve) => setTimeout(resolve, 30));

      order.push("first-end");
    });

    emitter.on("message", async () => {
      order.push("second-start");

      await new Promise((resolve) => setTimeout(resolve, 5));

      order.push("second-end");
    });

    await emitter.emitAsync("message", { value: "hello" });

    assert.deepEqual(order, [
      "first-start",
      "second-start",
      "second-end",
      "first-end",
    ]);
  });

  it("should wait for all async listeners before resolving", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    const completed: string[] = [];

    emitter.on("message", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      completed.push("slow");
    });

    emitter.on("message", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed.push("fast");
    });

    await emitter.emitAsync("message", { value: "hello" });

    assert.deepEqual(completed, ["fast", "slow"]);
  });

  it("should reject when an async listener fails", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    const error = new Error("listener failed");

    emitter.on("message", async () => {
      throw error;
    });

    await assert.rejects(
      emitter.emitAsync("message", { value: "hello" }),
      (received) => received === error,
    );
  });

  it("should wait for other listeners even when one fails", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    let completed = false;

    emitter.on("message", async () => {
      throw new Error("first failed");
    });

    emitter.on("message", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      completed = true;
    });

    await assert.rejects(emitter.emitAsync("message", { value: "hello" }));

    assert.equal(completed, true);
  });

  it("should throw an aggregate error when multiple listeners fail", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    emitter.on("message", async () => {
      throw new Error("first failed");
    });

    emitter.on("message", async () => {
      throw new Error("second failed");
    });

    await assert.rejects(
      emitter.emitAsync("message", { value: "hello" }),
      (error: any) => {
        assert.match(error.message, /\[Aggregate Event Error\]/);

        assert.match(error.message, /first failed/);
        assert.match(error.message, /second failed/);

        return true;
      },
    );
  });
});
