import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import tls from "tls";

import { HandshakeHandler } from "../../../../src/core/handlers/handshake.handler";
import { proxyEventManager } from "../../../../src/core/event/proxy-events/proxyEvents";
import { pluginEventManager } from "../../../../src/core/event/plugin-events/pluginEvents";
import { SocketGuard } from "../../../../src/core/utils/SocketGuard";
import { CAManager } from "../../../../src/core/CA/CAManager";
import { H1InboundBridge } from "../../../../src/core/transport/http1/H1InboundBridge";

const mockCertificateGeneration = () => {
  const originalGetCA = CAManager.getCA;
  const originalGenerateCA = CAManager.generateCA;

  CAManager.getCA = (async () => {
    return {} as tls.SecureContext;
  }) as typeof CAManager.getCA;

  CAManager.generateCA = (async () => {
    return {} as tls.SecureContext;
  }) as typeof CAManager.generateCA;

  return () => {
    CAManager.getCA = originalGetCA;
    CAManager.generateCA = originalGenerateCA;
  };
};

class MockSocket extends EventEmitter {
  destroyed = false;
  writable = true;

  written: string[] = [];
  unshifted: Buffer[] = [];

  write(data: string, callback?: (error?: Error) => void) {
    this.written.push(data);

    callback?.();

    return true;
  }

  destroy() {
    this.destroyed = true;
    return this;
  }

  unshift(data: Buffer) {
    this.unshifted.push(data);
    return this;
  }
}

class MockTLSSocket extends EventEmitter {
  destroyed = false;
  writable = true;

  constructor(
    public socket: MockSocket,
    _options?: any,
  ) {
    super();
  }
}

const createScope = (socket = new MockSocket()) =>
  ({
    session: {
      socket,
      head: null,
      protocol: {
        httpVersion: "h1",
      },
    },

    request: {
      client: {
        req: {
          socket,
          headers: {
            host: "example.com",
          },
        },

        res: {
          writableEnded: false,
          headersSent: false,
          writeHead() {},
          end() {},
        },
      },

      target: {
        originalHost: "example.com",
      },

      upstream: {},
    },

    lifecycle: {
      state: {
        get: () => undefined,
        set: () => {},
      },

      nextPhase: undefined,
    },
  }) as any;

describe("HandshakeHandler", () => {
  it("should return when client request is missing", async () => {
    const handler = new HandshakeHandler();
    const scope = createScope();

    // **No client request**
    scope.request.client.req = undefined;

    await assert.doesNotReject(() => handler.handle(scope));
  });

  it("should return when client socket is missing", async () => {
    const handler = new HandshakeHandler();
    const scope = createScope();

    scope.request.client.req = {
      socket: undefined,
    };

    await assert.doesNotReject(() => handler.handle(scope));
  });

  it("should return when request is already finished", async () => {
    const socket = new MockSocket();
    const handler = new HandshakeHandler();
    const scope = createScope(socket);

    scope.lifecycle.state.get = (key: string) => {
      if (key === "request.finished") {
        return true;
      }

      return undefined;
    };

    await handler.handle(scope);

    assert.equal(socket.destroyed, false);
    assert.equal(socket.written.length, 0);
  });

  it("should write 200 Connection Established when connect succeeds", async () => {
    const socket = new MockSocket();
    const handler = new HandshakeHandler();
    const scope = createScope(socket);

    const restoreCA = mockCertificateGeneration();

    const originalTLSSocket = tls.TLSSocket;
    const originalEnsureCleanupGuards = SocketGuard.ensureCleanupGuards;
    const originalH1Execute = H1InboundBridge.execute;

    let tlsSocket: MockTLSSocket | undefined;

    (tls as any).TLSSocket = class extends MockTLSSocket {
      constructor(socket: MockSocket, options?: any) {
        super(socket, options);

        tlsSocket = this;

        queueMicrotask(() => {
          this.emit("secure");
        });
      }
    };

    (SocketGuard as any).ensureCleanupGuards = () => {};
    (H1InboundBridge as any).execute = async () => {};

    try {
      await handler.handle(scope);

      assert.equal(
        socket.written[0],
        "HTTP/1.1 200 Connection Established\r\n\r\n",
      );

      assert.ok(tlsSocket);
    } finally {
      restoreCA();
      (tls as any).TLSSocket = originalTLSSocket;
      SocketGuard.ensureCleanupGuards = originalEnsureCleanupGuards;
      H1InboundBridge.execute = originalH1Execute;
    }
  });

  it("should unshift session head and clear it after CONNECT", async () => {
    const socket = new MockSocket();
    const handler = new HandshakeHandler();
    const scope = createScope(socket);

    const head = Buffer.from("buffered-data");
    scope.session.head = head;

    const restoreCA = mockCertificateGeneration();

    const originalTLSSocket = tls.TLSSocket;
    const originalEnsureCleanupGuards = SocketGuard.ensureCleanupGuards;
    const originalH1Execute = H1InboundBridge.execute;

    (tls as any).TLSSocket = class extends MockTLSSocket {
      constructor(socket: MockSocket, options?: any) {
        super(socket, options);

        queueMicrotask(() => {
          this.emit("secure");
        });
      }
    };

    (SocketGuard as any).ensureCleanupGuards = () => {};
    (H1InboundBridge as any).execute = async () => {};

    try {
      await handler.handle(scope);

      assert.equal(socket.unshifted.length, 1);
      assert.equal(socket.unshifted[0], head);
      assert.equal(scope.session.head, null);
    } finally {
      restoreCA();
      (tls as any).TLSSocket = originalTLSSocket;
      SocketGuard.ensureCleanupGuards = originalEnsureCleanupGuards;
      H1InboundBridge.execute = originalH1Execute;
    }
  });

  it("should emit connect:established after CONNECT succeeds", async () => {
    const socket = new MockSocket();
    const handler = new HandshakeHandler();
    const scope = createScope(socket);

    const originalProxyEmit = proxyEventManager.emitAsync;
    const originalPluginEmit = pluginEventManager.emitAsync;
    const restoreCA = mockCertificateGeneration();

    const originalTLSSocket = tls.TLSSocket;
    const originalEnsureCleanupGuards = SocketGuard.ensureCleanupGuards;
    const originalH1Execute = H1InboundBridge.execute;

    let receivedPayload: any;

    proxyEventManager.emitAsync = (async (event: any, payload: any) => {
      if (event === "connect:established") {
        receivedPayload = payload;
      }
    }) as typeof proxyEventManager.emitAsync;

    pluginEventManager.emitAsync =
      (async () => {}) as typeof pluginEventManager.emitAsync;

    (tls as any).TLSSocket = class extends MockTLSSocket {
      constructor(socket: MockSocket, options?: any) {
        super(socket, options);

        queueMicrotask(() => {
          this.emit("secure");
        });
      }
    };

    (SocketGuard as any).ensureCleanupGuards = () => {};
    (H1InboundBridge as any).execute = async () => {};

    try {
      await handler.handle(scope);

      assert.equal(receivedPayload.scope, scope);
      assert.equal(receivedPayload.socket, socket);
    } finally {
      proxyEventManager.emitAsync = originalProxyEmit;
      pluginEventManager.emitAsync = originalPluginEmit;
      restoreCA();

      (tls as any).TLSSocket = originalTLSSocket;
      SocketGuard.ensureCleanupGuards = originalEnsureCleanupGuards;
      H1InboundBridge.execute = originalH1Execute;
    }
  });

  it("should use a custom certificate when one is configured", async () => {
    const socket = new MockSocket();
    const handler = new HandshakeHandler();
    const scope = createScope(socket);

    const customLeaf = {
      key: Buffer.from("CUSTOM KEY"),
      cert: Buffer.from("CUSTOM CERT"),
    };

    scope.session.customCertificates = new Map([["example.com", customLeaf]]);

    const originalCreateSecureContext = tls.createSecureContext;
    const originalTLSSocket = tls.TLSSocket;
    const originalEnsureCleanupGuards = SocketGuard.ensureCleanupGuards;
    const originalH1Execute = H1InboundBridge.execute;

    let receivedCustomLeaf: any;

    (tls as any).createSecureContext = (options: any) => {
      receivedCustomLeaf = options;

      return {} as tls.SecureContext;
    };

    (tls as any).TLSSocket = class extends MockTLSSocket {
      constructor(socket: MockSocket, options?: any) {
        super(socket, options);

        queueMicrotask(() => {
          this.emit("secure");
        });
      }
    };

    (SocketGuard as any).ensureCleanupGuards = () => {};
    (H1InboundBridge as any).execute = async () => {};

    try {
      await handler.handle(scope);

      assert.deepEqual(receivedCustomLeaf, customLeaf);
    } finally {
      tls.createSecureContext = originalCreateSecureContext;
      (tls as any).TLSSocket = originalTLSSocket;
      SocketGuard.ensureCleanupGuards = originalEnsureCleanupGuards;
      H1InboundBridge.execute = originalH1Execute;
    }
  });

  it("should use CAManager.getCA when certificate cache is enabled", async () => {
    const socket = new MockSocket();
    const handler = new HandshakeHandler();

    // **Force the branch we're testing**
    (handler as any).config.useCertificateCache = true;
    (handler as any).config.rootCa = {
      cert: Buffer.from("ROOT CA CERT"),
      key: Buffer.from("ROOT CA KEY"),
    };

    const scope = createScope(socket);

    const originalGetCA = CAManager.getCA;
    const originalTLSSocket = tls.TLSSocket;
    const originalEnsureCleanupGuards = SocketGuard.ensureCleanupGuards;
    const originalH1Execute = H1InboundBridge.execute;

    let receivedHost: string | undefined;
    let receivedConfig: any;

    CAManager.getCA = (async (host: string, config: any) => {
      receivedHost = host;
      receivedConfig = config;

      return {} as tls.SecureContext;
    }) as typeof CAManager.getCA;

    (tls as any).TLSSocket = class extends MockTLSSocket {
      constructor(socket: MockSocket, options?: any) {
        super(socket, options);

        queueMicrotask(() => {
          this.emit("secure");
        });
      }
    };

    (SocketGuard as any).ensureCleanupGuards = () => {};
    (H1InboundBridge as any).execute = async () => {};

    try {
      await handler.handle(scope);

      assert.equal(receivedHost, "example.com");
      assert.equal(receivedConfig, handler.config);
    } finally {
      CAManager.getCA = originalGetCA;
      (tls as any).TLSSocket = originalTLSSocket;
      SocketGuard.ensureCleanupGuards = originalEnsureCleanupGuards;
      H1InboundBridge.execute = originalH1Execute;
    }
  });
});
