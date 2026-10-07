import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { SocketGuard } from "../../../../src/core/utils/SocketGuard";
import { ProxyUtils } from "../../../../src/core/utils/ProxyUtils";

class MockSocket extends EventEmitter {
  destroyed = false;

  destroyCalled = 0;

  destroy() {
    this.destroyCalled++;
    this.destroyed = true;
    return this;
  }

  unpipe() {
    return this;
  }
}

describe("SocketGuard", () => {
  afterEach(() => {
    // Restore any monkey-patched methods if needed.
  });

  it("should ignore an already destroyed socket", () => {
    const socket = new MockSocket();
    socket.destroyed = true;

    assert.doesNotThrow(() => {
      SocketGuard.ensureCleanupGuards(socket as any);
    });

    assert.equal(socket.listenerCount("error"), 0);
    assert.equal(socket.listenerCount("close"), 0);
  });

  it("should install guards only once", () => {
    const socket = new MockSocket();

    SocketGuard.ensureCleanupGuards(socket as any);
    SocketGuard.ensureCleanupGuards(socket as any);

    assert.equal(socket.listenerCount("error"), 1);
    assert.equal(socket.listenerCount("close"), 1);
  });

  it("should not throw for silent socket errors", () => {
    const socket = new MockSocket();

    SocketGuard.ensureCleanupGuards(socket as any);

    for (const code of [
      "ECONNRESET",
      "EPIPE",
      "ETIMEDOUT",
      "ERR_TLS_HANDSHAKE_TIMEOUT",
    ]) {
      assert.doesNotThrow(() => {
        socket.emit("error", Object.assign(new Error("expected"), { code }));
      });
    }
  });

  it("should log unexpected socket errors", () => {
    const socket = new MockSocket();

    const originalError = console.error;
    let logged = false;

    console.error = () => {
      logged = true;
    };

    try {
      SocketGuard.ensureCleanupGuards(socket as any);

      socket.emit(
        "error",
        Object.assign(new Error("unexpected failure"), {
          code: "ECONNREFUSED",
        }),
      );

      assert.equal(logged, true);
    } finally {
      console.error = originalError;
    }
  });

  it("should cleanup the socket when it closes", () => {
    const socket = new MockSocket();

    let cleanupCalled = false;

    const originalCleanup = ProxyUtils.cleanUp;

    (ProxyUtils as any).cleanUp = () => {
      cleanupCalled = true;
    };

    try {
      SocketGuard.ensureCleanupGuards(socket as any);

      socket.emit("close", false);

      assert.equal(cleanupCalled, true);
    } finally {
      (ProxyUtils as any).cleanUp = originalCleanup;
    }
  });

  it("should cleanup when the socket closes with an error flag", () => {
    const socket = new MockSocket();

    let cleanupCalled = false;

    const originalCleanup = ProxyUtils.cleanUp;

    (ProxyUtils as any).cleanUp = () => {
      cleanupCalled = true;
    };

    try {
      SocketGuard.ensureCleanupGuards(socket as any);

      assert.doesNotThrow(() => {
        socket.emit("close", true);
      });

      assert.equal(cleanupCalled, true);
    } finally {
      (ProxyUtils as any).cleanUp = originalCleanup;
    }
  });
});
