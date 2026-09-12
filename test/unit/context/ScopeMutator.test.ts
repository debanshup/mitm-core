import assert from "node:assert/strict";
import { describe, it } from "mocha";

import { StateStore } from "../../../src/core/state/StateStore";
import type { RequestScope } from "../../../src/core/scope/types";
import { ScopeMutator } from "../../../src/core/scope/ScopeMutator";
import { Duplex } from "node:stream";
import type { ClientRequest, IncomingMessage, ServerResponse } from "node:http";
import { ContextManager } from "../../../src/core/scope/ContextManager";

function createScope(): RequestScope {
  return {
    session: {
      connectionId: "test-connection",
      socket: {} as any,
      protocol: {},
    },

    request: {
      requestId: "test-request",
      client: {},
      upstream: {},
      target: {},
    },

    lifecycle: {
      state: new StateStore(),
      nextPhase: "request",
      isHijacked: false,
      timestamps: {
        receivedAt: Date.now(),
      },
    },
  };
}

function createSocket() {
  return new Duplex({
    read() {},
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

describe("ScopeMutator", () => {
  describe("finishPipeline()", () => {
    it("should mark the request as finished", () => {
      const scope = createScope();

      ScopeMutator.finishPipeline(scope);

      assert.equal(scope.lifecycle.state.get("request.finished"), true);
    });

    it("should stop the pipeline", () => {
      const scope = createScope();

      ScopeMutator.finishPipeline(scope);

      assert.equal(scope.lifecycle.nextPhase, undefined);
    });

    it("should preserve unrelated lifecycle state when finishing", () => {
      const scope = createScope();

      scope.lifecycle.isHijacked = true;
      scope.lifecycle.state.set("response.cacheHit", true);

      ScopeMutator.finishPipeline(scope);

      assert.equal(scope.lifecycle.isHijacked, true);

      assert.equal(scope.lifecycle.state.get("response.cacheHit"), true);

      assert.equal(scope.lifecycle.state.get("request.finished"), true);

      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
    it("should destroy the request lifecycle when finishing the pipeline", () => {
      const socket = createSocket();
      const scope = ContextManager.getOrCreateScope(socket);

      const originalLifecycle = scope.lifecycle;

      ScopeMutator.finishPipeline(scope);

      const newLifecycle = ContextManager.getOrCreateRequestLifecycle(
        scope.request.requestId,
      );

      assert.notEqual(newLifecycle, originalLifecycle);
    });
  });

  describe("failPipeline()", () => {
    it("should mark the request as failed", () => {
      const scope = createScope();

      ScopeMutator.failPipeline(scope);

      assert.equal(scope.lifecycle.state.get("error"), true);
    });

    it("should stop the pipeline", () => {
      const scope = createScope();

      ScopeMutator.failPipeline(scope);

      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
    it("should preserve unrelated lifecycle state when failing", () => {
      const scope = createScope();

      scope.lifecycle.isHijacked = true;
      scope.lifecycle.state.set("request.cacheHit", true);
      scope.lifecycle.nextPhase = "response";

      ScopeMutator.failPipeline(scope);

      assert.equal(scope.lifecycle.isHijacked, true);

      assert.equal(scope.lifecycle.state.get("request.cacheHit"), true);

      assert.equal(scope.lifecycle.state.get("error"), true);

      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
    it("should destroy the request lifecycle when failing the pipeline", () => {
      const socket = createSocket();
      const scope = ContextManager.getOrCreateScope(socket);

      const originalLifecycle = scope.lifecycle;

      ScopeMutator.failPipeline(scope);

      const newLifecycle = ContextManager.getOrCreateRequestLifecycle(
        scope.request.requestId,
      );

      assert.notEqual(newLifecycle, originalLifecycle);
    });
  });

  describe("initializeSessionScope()", () => {
    describe("initializeSessionContext()", () => {
      it("should create a session context", () => {
        const socket = createSocket();

        const session = ScopeMutator.initializeSessionContext(socket);

        assert.ok(session);
        assert.equal(session.socket, socket);
        assert.ok(session.connectionId);

        socket.destroy();
      });

      it("should return the same session for the same socket", () => {
        const socket = createSocket();

        const first = ScopeMutator.initializeSessionContext(socket);

        const second = ScopeMutator.initializeSessionContext(socket);

        assert.equal(first, second);

        socket.destroy();
      });
    });
  });

  describe("applyHttpPlainState()", () => {
    it("should populate HTTP request state", () => {
      const scope = createScope();

      const req = {
        httpVersion: "1.1",
        method: "GET",
        url: "http://example.com/api/users",
        headers: {
          host: "example.com",
          "user-agent": "test",
        },
      } as IncomingMessage;

      const res = {} as ServerResponse;

      const result = ScopeMutator.applyHttpPlainState(scope, req, res);

      assert.equal(result, true);

      // session
      assert.equal(scope.session.protocol.connectionType, "http");
      assert.equal(scope.session.protocol.httpVersion, "h1");

      // client
      assert.equal(scope.request.client.req, req);
      assert.equal(scope.request.client.res, res);
      assert.equal(scope.request.client.method, "GET");
      assert.equal(scope.request.client.url, req.url);
      assert.deepEqual(scope.request.client.headers, req.headers);

      // target
      assert.equal(scope.request.target.originalHost, "example.com");
      assert.equal(
        scope.request.target.originalUrl,
        "http://example.com/api/users",
      );
      assert.equal(scope.request.target.host, "example.com");
      assert.equal(scope.request.target.url, "http://example.com/api/users");

      // lifecycle
      assert.equal(scope.lifecycle.nextPhase, "request");
    });
    it("should return false when request is missing", () => {
      const scope = createScope();
      const res = {} as ServerResponse;

      const result = ScopeMutator.applyHttpPlainState(
        scope,
        undefined as unknown as IncomingMessage,
        res,
      );

      assert.equal(result, false);
    });
    it("should return false when response is missing", () => {
      const scope = createScope();

      const req = {
        httpVersion: "1.1",
        method: "GET",
        url: "http://example.com/",
        headers: {
          host: "example.com",
        },
      } as IncomingMessage;

      const result = ScopeMutator.applyHttpPlainState(
        scope,
        req,
        undefined as unknown as ServerResponse,
      );

      assert.equal(result, false);
    });
  });

  describe("HTTP version detection", () => {
    it("should identify HTTP/1.0 as h1", () => {
      const scope = createScope();

      const req = {
        httpVersion: "1.0",
        method: "GET",
        url: "http://example.com/",
        headers: {
          host: "example.com",
        },
      } as IncomingMessage;

      const res = {} as ServerResponse;

      ScopeMutator.applyHttpPlainState(scope, req, res);

      assert.equal(scope.session.protocol.httpVersion, "h1");
    });

    it("should identify HTTP/1.1 as h1", () => {
      const scope = createScope();

      const req = {
        httpVersion: "1.1",
        method: "GET",
        url: "http://example.com/",
        headers: {
          host: "example.com",
        },
      } as IncomingMessage;

      const res = {} as ServerResponse;

      ScopeMutator.applyHttpPlainState(scope, req, res);

      assert.equal(scope.session.protocol.httpVersion, "h1");
    });

    it("should identify non-HTTP/1.x as unknown", () => {
      const scope = createScope();

      const req = {
        httpVersion: "2.0",
        method: "GET",
        url: "https://example.com/",
        headers: {
          host: "example.com",
        },
      } as IncomingMessage;

      const res = {} as ServerResponse;

      ScopeMutator.applyHttpPlainState(scope, req, res);

      assert.equal(scope.session.protocol.httpVersion, "unknown");
    });
    it("should preserve existing lifecycle state", () => {
      const scope = createScope();

      scope.lifecycle.isHijacked = true;
      scope.lifecycle.state.set("request.cacheHit", true);

      const req = {
        httpVersion: "1.1",
        method: "GET",
        url: "http://example.com/",
        headers: {
          host: "example.com",
        },
      } as IncomingMessage;

      const res = {} as ServerResponse;

      ScopeMutator.applyHttpPlainState(scope, req, res);

      assert.equal(scope.lifecycle.isHijacked, true);
      assert.equal(scope.lifecycle.state.get("request.cacheHit"), true);

      assert.equal(scope.lifecycle.nextPhase, "request");
    });
  });

  describe("applyConnectState()", () => {
    it("should populate CONNECT state", () => {
      const scope = createScope();

      const req = {
        httpVersion: "1.1",
        method: "CONNECT",
        url: "example.com:443",
        headers: {
          host: "example.com:443",
        },
      } as IncomingMessage;

      const socket = createSocket();

      const head = Buffer.from("tls-head");

      const result = ScopeMutator.applyConnectState(scope, req, socket, head);

      assert.equal(result, true);

      // session
      assert.equal(scope.session.protocol.connectionType, "https");
      assert.equal(scope.session.protocol.httpVersion, "h1");
      assert.equal(scope.session.socket, socket);
      assert.equal(scope.session.head, head);

      // client
      assert.equal(scope.request.client.req, req);
      assert.deepEqual(scope.request.client.headers, req.headers);

      // target
      assert.equal(scope.request.target.originalHost, "example.com");
      assert.equal(scope.request.target.originalUrl, "example.com:443");

      // lifecycle
      assert.equal(scope.lifecycle.nextPhase, "handshake");

      socket.destroy();
    });

    it("should return false when request is missing", () => {
      const scope = createScope();

      const socket = createSocket();

      const result = ScopeMutator.applyConnectState(
        scope,
        undefined as unknown as IncomingMessage,
        socket,
        Buffer.alloc(0),
      );

      assert.equal(result, false);

      socket.destroy();
    });

    it("should return false when socket is missing", () => {
      const scope = createScope();

      const req = {
        httpVersion: "1.1",
        method: "CONNECT",
        url: "example.com:443",
        headers: {
          host: "example.com:443",
        },
      } as IncomingMessage;

      const result = ScopeMutator.applyConnectState(
        scope,
        req,
        undefined as unknown as Duplex,
        Buffer.alloc(0),
      );

      assert.equal(result, false);
    });

    it("should accept an empty CONNECT head", () => {
      const scope = createScope();

      const req = {
        httpVersion: "1.1",
        method: "CONNECT",
        url: "example.com:443",
        headers: {
          host: "example.com:443",
        },
      } as IncomingMessage;

      const socket = createSocket();

      const head = Buffer.alloc(0);

      const result = ScopeMutator.applyConnectState(scope, req, socket, head);

      assert.equal(result, true);
      assert.equal(scope.session.head, head);
      assert.equal(scope.lifecycle.nextPhase, "handshake");

      socket.destroy();
    });
  });

  describe("applyHttpsDecryptedState()", () => {
    it("should populate decrypted HTTPS request state", () => {
      const scope = createScope();

      const req = {
        httpVersion: "1.1",
        method: "POST",
        url: "/api/users?active=true",
        headers: {
          host: "example.com",
          "content-type": "application/json",
        },
      } as IncomingMessage;

      scope.request.client.req = req;

      const result = ScopeMutator.applyHttpsDecryptedState(scope);

      assert.equal(result, true);

      assert.equal(scope.request.client.method, "POST");
      assert.equal(scope.request.client.url, "/api/users?active=true");
      assert.deepEqual(scope.request.client.headers, req.headers);

      assert.equal(scope.request.target.host, "example.com");

      assert.equal(
        scope.request.target.url,
        "http://example.com/api/users?active=true",
      );

      assert.equal(scope.lifecycle.nextPhase, "request");
    });

    it("should return false when decrypted request is missing", () => {
      const scope = createScope();

      const result = ScopeMutator.applyHttpsDecryptedState(scope);

      assert.equal(result, false);
    });
  });

  describe("applyUpgradeState()", () => {
    it("should populate WebSocket upgrade state", () => {
      const scope = createScope();

      const req = {
        httpVersion: "1.1",
        method: "GET",
        url: "/chat",
        headers: {
          host: "example.com",
          upgrade: "websocket",
        },
        socket: {
          encrypted: false,
        },
      } as unknown as IncomingMessage;

      const socket = createSocket();

      const head = Buffer.from("upgrade-head");

      const result = ScopeMutator.applyUpgradeState(scope, req, socket, head);

      assert.equal(result, true);

      // session
      assert.equal(scope.session.protocol.connectionType, "http");
      assert.equal(scope.session.protocol.httpVersion, "h1");

      // client
      assert.equal(scope.request.client.req, req);
      assert.equal(scope.request.client.method, "GET");
      assert.equal(scope.request.client.url, "/chat");
      assert.deepEqual(scope.request.client.headers, req.headers);

      // target
      assert.equal(scope.request.target.originalHost, "example.com");

      assert.equal(scope.request.target.originalUrl, "http://example.com/chat");

      assert.equal(scope.request.target.host, "example.com");

      assert.equal(scope.request.target.url, "ws://example.com/chat");

      // websocket
      assert.ok(scope.request.webSocket);
      assert.equal(scope.request.webSocket.isUpgraded, false);
      assert.equal(scope.request.webSocket.rawUpgradeSocket, socket);
      assert.equal(scope.request.webSocket.upgradeHead, head);

      // lifecycle
      assert.equal(scope.lifecycle.nextPhase, "request");

      socket.destroy();
    });

    it("should return false when request is missing", () => {
      const scope = createScope();

      const socket = createSocket();
      const result = ScopeMutator.applyUpgradeState(
        scope,
        undefined as unknown as IncomingMessage,
        socket,
        Buffer.alloc(0),
      );

      assert.equal(result, false);

      socket.destroy();
    });

    it("should return false when socket is missing", () => {
      const scope = createScope();

      const req = {
        httpVersion: "1.1",
        method: "GET",
        url: "/chat",
        headers: {
          host: "example.com",
          upgrade: "websocket",
        },
      } as IncomingMessage;

      const result = ScopeMutator.applyUpgradeState(
        scope,
        req,
        undefined as unknown as Duplex,
        Buffer.alloc(0),
      );

      assert.equal(result, false);
    });
    it("should use wss for an encrypted socket", () => {
      const scope = createScope();

      const req = {
        httpVersion: "1.1",
        method: "GET",
        url: "/chat",
        headers: {
          host: "example.com",
          upgrade: "websocket",
        },
      } as IncomingMessage;

      const socket = createSocket() as Duplex & { encrypted?: boolean };

      socket.encrypted = true;

      const result = ScopeMutator.applyUpgradeState(
        scope,
        req,
        socket,
        Buffer.alloc(0),
      );

      assert.equal(result, true);

      assert.equal(scope.request.target.url, "wss://example.com/chat");

      socket.destroy();
    });
  });

  describe("applyUpstreamInitState()", () => {
    it("should store the upstream request and move to response phase", async () => {
      const scope = createScope();

      const upstreamReq = {} as ClientRequest;

      const result = ScopeMutator.applyUpstreamInitState(scope, upstreamReq);

      assert.equal(result, true);
      assert.equal(scope.request.upstream.req, upstreamReq);
      assert.equal(scope.lifecycle.nextPhase, "response");
    });

    it("should return false when upstream request is missing", async () => {
      const scope = createScope();

      const result = ScopeMutator.applyUpstreamInitState(
        scope,
        undefined as unknown as ClientRequest,
      );

      assert.equal(result, false);
    });
  });

  describe("applyResponseState()", () => {
    it("should store the upstream response and move to response phase", () => {
      const scope = createScope();

      const upstreamRes = {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
        },
      } as IncomingMessage;

      const result = ScopeMutator.applyResponseState(scope, upstreamRes);

      assert.equal(result, true);

      assert.equal(scope.request.upstream.res, upstreamRes);

      assert.equal(scope.lifecycle.nextPhase, "response");
    });

    it("should return false when upstream response is missing", () => {
      const scope = createScope();

      const result = ScopeMutator.applyResponseState(
        scope,
        undefined as unknown as IncomingMessage,
      );

      assert.equal(result, false);
    });
  });
});
