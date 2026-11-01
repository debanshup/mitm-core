import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { WSOutboundBridge } from "../../../../../src/core/transport/ws/WSOutboundBridge";
import { WSUpstreamInitiator } from "../../../../../src/core/transport/ws/WSUpstreamInitiator";
import { pluginEventManager } from "../../../../../src/core/event/plugin-events/pluginEvents";
import WebSocket from "ws";

describe("WSOutboundBridge", () => {
  afterEach(() => {
    pluginEventManager.removeAllListeners();
  });

  it("should stop tunnel setup when client-upgrade plugin hijacks the request", async () => {
    const scope: any = {
      session: {},
      request: {
        client: {
          req: {
            method: "GET",
            headers: { host: "example.com" },
          },
        },
        upstream: {},
        target: {
          url: "ws://example.com/socket",
        },
        webSocket: {
          isUpgraded: false,
          rawUpgradeSocket: Object.assign(new PassThrough(), {
            setNoDelay() {},
          }),
          upgradeHead: Buffer.alloc(0),
        },
      },
      lifecycle: {
        isHijacked: false,
      },
    };

    const upstreamReq = new EventEmitter() as any;
    upstreamReq.end = () => {};
    upstreamReq.destroy = () => {};

    const originalInit = WSUpstreamInitiator.init;
    const originalHandleUpgrade = (WebSocket as any).WebSocketServer.prototype
      .handleUpgrade;

    let tunnelSetupCalled = false;

    WSUpstreamInitiator.init = (() => upstreamReq) as any;

    (WebSocket as any).WebSocketServer.prototype.handleUpgrade = function () {
      tunnelSetupCalled = true;
    } as any;

    pluginEventManager.on("proxy:client-upgrade", ({ scope }) => {
      scope.lifecycle.isHijacked = true;
    });

    try {
      await WSOutboundBridge.execute(scope);

      const upstreamSocket = Object.assign(new PassThrough(), {
        setNoDelay() {},
      });

      upstreamReq.emit(
        "upgrade",
        { headers: {} },
        upstreamSocket,
        Buffer.alloc(0),
      );

      // Allow the async upgrade callback to finish.
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(scope.lifecycle.isHijacked, true);
      assert.equal(tunnelSetupCalled, false);
      assert.equal(scope.request.webSocket.isUpgraded, false);
    } finally {
      WSUpstreamInitiator.init = originalInit;
      (WebSocket as any).WebSocketServer.prototype.handleUpgrade =
        originalHandleUpgrade;
    }
  });

  it("should stop forwarding client messages when plugin hijacks", async () => {
    const scope: any = {
      lifecycle: { isHijacked: false },
    };

    const upstreamWS: any = {
      readyState: WebSocket.OPEN,
      sendCalled: false,
      send() {
        this.sendCalled = true;
      },
    };

    const originalEmitAsync = pluginEventManager.emitAsync;

    (pluginEventManager as any).emitAsync = async (event: any) => {
      if (event === "proxy:ws-client-message") {
        scope.lifecycle.isHijacked = true;
      }
    };

    try {
      await (WSOutboundBridge as any).handleClientMessage(
        scope,
        Buffer.from("hello"),
        false,
        upstreamWS,
      );

      assert.equal(scope.lifecycle.isHijacked, true);
      assert.equal(upstreamWS.sendCalled, false);
    } finally {
      pluginEventManager.emitAsync = originalEmitAsync;
    }
  });

  it("should stop forwarding upstream messages when plugin hijacks", async () => {
    const scope: any = {
      lifecycle: { isHijacked: false },
    };

    const clientWS: any = {
      readyState: WebSocket.OPEN,
      sendCalled: false,
      send() {
        this.sendCalled = true;
      },
    };

    const originalEmitAsync = pluginEventManager.emitAsync;

    (pluginEventManager as any).emitAsync = async (event: any) => {
      if (event === "proxy:ws-upstream-message") {
        scope.lifecycle.isHijacked = true;
      }
    };

    try {
      await (WSOutboundBridge as any).handleUpstreamMessage(
        scope,
        Buffer.from("hello"),
        false,
        clientWS,
      );

      assert.equal(scope.lifecycle.isHijacked, true);
      assert.equal(clientWS.sendCalled, false);
    } finally {
      pluginEventManager.emitAsync = originalEmitAsync;
    }
  });
});
