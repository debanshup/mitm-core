import assert from "node:assert/strict";

import { PipelineAbortSignal } from "../../../src/core/signals/pipelineAbortSignal";

describe("PipelineAbortSignal", () => {
  it("should use the default message when no payload is provided", () => {
    const signal = new PipelineAbortSignal();

    assert.equal(signal.message, "Pipeline halted intentionally");

    assert.equal(signal.name, "PipelineAbortSignal");
    assert.equal(signal.data, undefined);
    assert.ok(signal instanceof Error);
    assert.ok(signal instanceof PipelineAbortSignal);
  });

  it("should use a string payload as the error message", () => {
    const signal = new PipelineAbortSignal("plugin stopped pipeline");

    assert.equal(signal.message, "plugin stopped pipeline");
    assert.equal(signal.name, "PipelineAbortSignal");
    assert.equal(signal.data, undefined);
  });

  it("should preserve AbortMessage data", () => {
    const plugin = {} as any;

    const payload = {
      message: "Request blocked",
      plugin,
      event: "proxy:client-http-request",
    };

    const signal = new PipelineAbortSignal(payload);

    assert.equal(signal.message, "Request blocked");
    assert.equal(signal.name, "PipelineAbortSignal");
    assert.equal(signal.data, payload);
    assert.equal(signal.data?.plugin, plugin);
    assert.equal(signal.data?.event, "proxy:client-http-request");
  });

  it("should have a proper PipelineAbortSignal prototype", () => {
    const signal = new PipelineAbortSignal("intentional halt");

    assert.ok(signal instanceof PipelineAbortSignal);
    assert.ok(signal instanceof Error);
    assert.equal(Object.getPrototypeOf(signal), PipelineAbortSignal.prototype);
    assert.ok(signal.stack);
  });
});
