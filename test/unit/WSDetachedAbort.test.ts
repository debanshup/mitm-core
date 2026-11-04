import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "mocha";

import { WSOutboundBridge } from "../../src/core/transport/ws/WSOutboundBridge";
import { PipelineAbortSignal } from "../../src/core/signals/pipelineAbortSignal";
import { proxyEventManager } from "../../src/core/event/proxy-events/proxyEvents";

type HandleMessageSafely = (
  operation: () => Promise<void>,
  onError: (error: unknown) => void,
) => Promise<void>;

const handleMessageSafely = (
  WSOutboundBridge as unknown as {
    handleMessageSafely: HandleMessageSafely;
  }
).handleMessageSafely.bind(WSOutboundBridge);

describe("WS Detached Event Abort Handling", function () {
  let reportedErrors: unknown[] = [];

  const errorListener = (error: unknown): void => {
    reportedErrors.push(error);
  };

  beforeEach(function () {
    reportedErrors = [];
    proxyEventManager.on("error", errorListener);
  });

  afterEach(function () {
    proxyEventManager.off("error", errorListener);
  });

  it("should not report PipelineAbortSignal as a proxy error", async function () {
    const abortError = new PipelineAbortSignal("Intentional plugin abort");

    let cleanupError: unknown;

    await handleMessageSafely(
      async () => {
        throw abortError;
      },
      (error) => {
        cleanupError = error;
      },
    );

    assert.equal(cleanupError, abortError);
    assert.equal(reportedErrors.length, 0);
  });

  it("should report ordinary errors and invoke cleanup", async function () {
    const error = new Error("WebSocket message failure");

    let cleanupError: unknown;

    await handleMessageSafely(
      async () => {
        throw error;
      },
      (caughtError) => {
        cleanupError = caughtError;
      },
    );

    assert.equal(cleanupError, error);
    assert.equal(reportedErrors.length, 1);
    assert.equal(reportedErrors[0], error);
  });

  it("should not report errors when the operation succeeds", async function () {
    let cleanupCalled = false;

    await handleMessageSafely(
      async () => {
        // Successful operation
      },
      () => {
        cleanupCalled = true;
      },
    );

    assert.equal(cleanupCalled, false);
    assert.equal(reportedErrors.length, 0);
  });

  it("should not reject if cleanup itself throws", async function () {
    const error = new Error("WebSocket failure");
    const cleanupError = new Error("Cleanup failure");

    await assert.doesNotReject(
      handleMessageSafely(
        async () => {
          throw error;
        },
        () => {
          throw cleanupError;
        },
      ),
    );

    assert.equal(reportedErrors.length, 1);
    assert.equal(reportedErrors[0], error);
  });
});
