import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { TcpHandler } from "../../../../src/core/handlers/tcp.handler";
import { SocketGuard } from "../../../../src/core/utils/SocketGuard";

class MockSocket extends EventEmitter {
  destroyed = false;
  noDelay?: boolean;

  setNoDelay(value: boolean) {
    this.noDelay = value;
    return this;
  }
}

const createScope = (socket: any) =>
  ({
    session: {
      socket,
    },
  }) as any;

describe("TcpHandler", () => {
  it("should return when socket is missing", async () => {
    const handler = new TcpHandler();

    await assert.doesNotReject(handler.handle(createScope(undefined)));
  });

  it("should return when socket is destroyed", async () => {
    const socket = new MockSocket();
    socket.destroyed = true;

    const handler = new TcpHandler();

    await assert.doesNotReject(handler.handle(createScope(socket)));

    assert.equal(socket.noDelay, undefined);
  });

  it("should enable TCP_NODELAY on an active socket", async () => {
    const socket = new MockSocket();
    const handler = new TcpHandler();

    await handler.handle(createScope(socket));

    assert.equal(socket.noDelay, true);
  });

  it("should install SocketGuard on an active socket", async () => {
    const socket = new MockSocket();

    const originalEnsureCleanupGuards = SocketGuard.ensureCleanupGuards;

    let guardCalled = false;

    SocketGuard.ensureCleanupGuards = (receivedSocket) => {
      guardCalled = true;
      assert.equal(receivedSocket, socket);
    };

    try {
      const handler = new TcpHandler();

      await handler.handle(createScope(socket));

      assert.equal(guardCalled, true);
    } finally {
      SocketGuard.ensureCleanupGuards = originalEnsureCleanupGuards;
    }
  });
});
