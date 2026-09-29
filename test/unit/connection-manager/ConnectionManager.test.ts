import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type net from "node:net";
import { connectionManager } from "../../../src/core/connection/ConnectionManager";


class MockSocket extends EventEmitter {
  destroyed = false;

  destroy(): this {
    this.destroyed = true;
    this.emit("close");
    return this;
  }
}

describe("ConnectionManager", () => {
  afterEach(() => {
    connectionManager.destroyAll();
  });

  it("should track a socket", () => {
    const socket = new MockSocket();

    connectionManager.track(socket as unknown as net.Socket);

    assert.equal(connectionManager.getCount(), 1);
  });

  it("should not track the same socket twice", () => {
    const socket = new MockSocket();

    connectionManager.track(socket as unknown as net.Socket);
    connectionManager.track(socket as unknown as net.Socket);

    assert.equal(connectionManager.getCount(), 1);
  });

  it("should automatically untrack a socket when it closes", () => {
    const socket = new MockSocket();

    connectionManager.track(socket as unknown as net.Socket);

    assert.equal(connectionManager.getCount(), 1);

    socket.emit("close");

    assert.equal(connectionManager.getCount(), 0);
  });

  it("should track multiple sockets independently", () => {
    const socket1 = new MockSocket();
    const socket2 = new MockSocket();
    const socket3 = new MockSocket();

    connectionManager.track(socket1 as unknown as net.Socket);
    connectionManager.track(socket2 as unknown as net.Socket);
    connectionManager.track(socket3 as unknown as net.Socket);

    assert.equal(connectionManager.getCount(), 3);

    socket2.emit("close");

    assert.equal(connectionManager.getCount(), 2);
  });

  it("should destroy all active sockets", () => {
    const socket1 = new MockSocket();
    const socket2 = new MockSocket();

    connectionManager.track(socket1 as unknown as net.Socket);
    connectionManager.track(socket2 as unknown as net.Socket);

    connectionManager.destroyAll();

    assert.equal(socket1.destroyed, true);
    assert.equal(socket2.destroyed, true);
    assert.equal(connectionManager.getCount(), 0);
  });

  it("should not destroy an already destroyed socket", () => {
    const socket = new MockSocket();
    socket.destroyed = true;

    connectionManager.track(socket as unknown as net.Socket);

    connectionManager.destroyAll();

    assert.equal(socket.destroyed, true);
    assert.equal(connectionManager.getCount(), 0);
  });

  it("should safely destroy an empty connection set", () => {
    assert.equal(connectionManager.getCount(), 0);

    connectionManager.destroyAll();

    assert.equal(connectionManager.getCount(), 0);
  });
});
