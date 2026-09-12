import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { connectionEvents } from "../../../src/core/event/connection-events/connectionEvents";
import { proxyEventManager } from "../../../src/core/event/proxy-events/proxyEvents";

describe("Global Event Managers", () => {
  afterEach(() => {
    connectionEvents.removeAllListeners();
    proxyEventManager.removeAllListeners();

    assert.equal(connectionEvents.listenerCount("TCP"), 0);
    assert.equal(connectionEvents.listenerCount("HTTP:PLAIN"), 0);
    assert.equal(proxyEventManager.listenerCount("http:request"), 0);
    assert.equal(proxyEventManager.listenerCount("error"), 0);
  });

  it("should propagate TCP connection payload through connectionEvents", async () => {
    const socket = new EventEmitter();

    let receivedSocket: unknown;

    connectionEvents.on("TCP", ({ socket }) => {
      receivedSocket = socket;
    });

    await connectionEvents.emitAsync("TCP", { socket: socket as any });

    assert.equal(receivedSocket, socket);
  });

  it("should propagate HTTP request scope through connectionEvents", async () => {
    const scope = {} as any;

    let receivedScope: unknown;

    connectionEvents.on("HTTP:PLAIN", ({ scope: eventScope }) => {
      receivedScope = eventScope;
    });

    await connectionEvents.emitAsync("HTTP:PLAIN", {
      req: {} as any,
      res: {} as any,
      scope,
    });

    assert.equal(receivedScope, scope);
  });

  it("should propagate proxy HTTP request events", async () => {
    const scope = {} as any;

    let receivedScope: unknown;

    proxyEventManager.on("http:request", ({ scope: eventScope }) => {
      receivedScope = eventScope;
    });

    await proxyEventManager.emitAsync("http:request", { scope });

    assert.equal(receivedScope, scope);
  });

  it("should propagate proxy error events", async () => {
    const error = new Error("test error");

    let receivedError: unknown;

    proxyEventManager.on("error", (eventError) => {
      receivedError = eventError;
    });

    await proxyEventManager.emitAsync("error", error);

    assert.equal(receivedError, error);
  });
});
