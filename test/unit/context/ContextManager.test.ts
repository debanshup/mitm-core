import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { Duplex } from "node:stream";
import { ContextManager } from "../../../src/core/scope/ContextManager";

function createSocket(): Duplex {
  return new Duplex({
    read() {},
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

describe("ContextManager", () => {
  describe("getOrCreateSessionContext()", () => {
    it("should return the same session for the same socket", () => {
      const socket = createSocket();

      const first = ContextManager.getOrCreateSessionContext(socket);
      const second = ContextManager.getOrCreateSessionContext(socket);

      assert.equal(first, second);
      assert.equal(first.socket, socket);
      assert.ok(first.connectionId);

      socket.destroy();
    });

    it("should create different sessions for different sockets", () => {
      const socketA = createSocket();
      const socketB = createSocket();

      const sessionA = ContextManager.getOrCreateSessionContext(socketA);

      const sessionB = ContextManager.getOrCreateSessionContext(socketB);

      assert.notEqual(sessionA, sessionB);
      assert.notEqual(sessionA.connectionId, sessionB.connectionId);

      socketA.destroy();
      socketB.destroy();
    });
    it("should index the session by connection ID", () => {
      const socket = createSocket();

      const session = ContextManager.getOrCreateSessionContext(socket);

      const result = ContextManager.getProxyCtxByID(session.connectionId);

      assert.equal(result, session);

      socket.destroy();
    });
    it("should remove the session from the connection index", () => {
      const socket = createSocket();

      const session = ContextManager.getOrCreateSessionContext(socket);

      assert.ok(ContextManager.getProxyCtxByID(session.connectionId));

      ContextManager.removeContext(socket);

      assert.equal(
        ContextManager.getProxyCtxByID(session.connectionId),
        undefined,
      );

      socket.destroy();
    });
    it("should remove the session from the connection index when socket closes", async () => {
      const socket = createSocket();

      const context = ContextManager.getOrCreateSessionContext(socket);

      const closed = new Promise<void>((resolve) => {
        socket.once("close", () => resolve());
      });

      socket.destroy();

      await closed;

      assert.equal(
        ContextManager.getProxyCtxByID(context.connectionId),
        undefined,
      );
    });
  });

  describe("getOrCreateRequestContext()", () => {
   it("should return the same request context for the same session and stream", () => {
     const socket = createSocket();

     const session = ContextManager.getOrCreateSessionContext(socket);

     const first = ContextManager.getOrCreateRequestContext(
       session,
       undefined,
       1,
     );

     const second = ContextManager.getOrCreateRequestContext(
       session,
       undefined,
       1,
     );

     assert.equal(first, second);
   });

   it("should create a new request context for a new H1 transaction on the same socket", () => {
     const socket = createSocket();
     const session = ContextManager.getOrCreateSessionContext(socket);

     const firstReq = {
       method: "GET",
       url: "/first",
       headers: { host: "example.com" },
     } as any;

     const secondReq = {
       method: "GET",
       url: "/second",
       headers: { host: "example.com" },
     } as any;

     const first = ContextManager.getOrCreateRequestContext(
       session,
       firstReq,
       "h1",
     );

     const second = ContextManager.getOrCreateRequestContext(
       session,
       secondReq,
       "h1",
     );

     assert.notEqual(first.requestId, second.requestId);
     assert.equal(second.client.req, secondReq);
     assert.equal(second.client.url, "/second");
   });

    it("should create different request contexts for different streams", () => {
      const socket = createSocket();
      const session = ContextManager.getOrCreateSessionContext(socket);

      const first = ContextManager.getOrCreateRequestContext(
        session,
        undefined,
        1,
      );

      const second = ContextManager.getOrCreateRequestContext(
        session,
        undefined,
        3,
      );

      assert.notEqual(first, second);
      assert.notEqual(first.requestId, second.requestId);
    });

    it("should copy request data into the request context", () => {
      const socket = createSocket();
      const session = ContextManager.getOrCreateSessionContext(socket);

      const req = {
        method: "POST",
        url: "/api/users",
        headers: {
          host: "example.com",
          "content-type": "application/json",
        },
      } as any;

      const context = ContextManager.getOrCreateRequestContext(
        session,
        req,
        "h1",
      );

      assert.equal(context.client.req, req);
      assert.equal(context.client.res, undefined);
      assert.equal(context.client.method, "POST");
      assert.equal(context.client.url, "/api/users");
      assert.deepEqual(context.client.headers, req.headers);

      assert.equal(context.target.originalUrl, "/api/users");
      assert.equal(context.target.originalHost, "example.com");
    });

    it("should create a request context without a request", () => {
      const socket = createSocket();
      const session = ContextManager.getOrCreateSessionContext(socket);

      const context = ContextManager.getOrCreateRequestContext(
        session,
        undefined,
        "h1",
      );

      assert.ok(context.requestId);
      assert.equal(context.client.req, undefined);
      assert.equal(context.client.method, undefined);
      assert.equal(context.client.url, undefined);
      assert.deepEqual(context.client.headers, undefined);
    });

    it("should remove the request context when the socket closes", async () => {
      const socket = createSocket();
      const session = ContextManager.getOrCreateSessionContext(socket);

      const context = ContextManager.getOrCreateRequestContext(
        session,
        undefined,
        "h1",
      );

      // Create another request using the same stream key.
      const sameBeforeClose = ContextManager.getOrCreateRequestContext(
        session,
        undefined,
        "h1",
      );

      assert.equal(sameBeforeClose, context);

      const closed = new Promise<void>((resolve) => {
        socket.once("close", () => resolve());
      });

      socket.destroy();

      await closed;

      // After cleanup, the same key should produce a new context.
      const newContext = ContextManager.getOrCreateRequestContext(
        session,
        undefined,
        "h1",
      );

      assert.notEqual(newContext, context);
      assert.notEqual(newContext.requestId, context.requestId);
    });
    it("should create a new request context for a new H1 transaction on the same socket", () => {
      const socket = createSocket();
      const session = ContextManager.getOrCreateSessionContext(socket);

      const firstReq = {
        method: "GET",
        url: "/first",
        headers: { host: "example.com" },
      } as any;

      const secondReq = {
        method: "GET",
        url: "/second",
        headers: { host: "example.com" },
      } as any;

      const first = ContextManager.getOrCreateRequestContext(
        session,
        firstReq,
        "h1",
      );

      // Simulate the next H1 transaction.
      const second = ContextManager.getOrCreateRequestContext(
        session,
        secondReq,
        "h1",
      );

      assert.notEqual(first.requestId, second.requestId);
      assert.equal(second.client.req, secondReq);
      assert.equal(second.client.url, "/second");
    });
  });
  describe("getOrCreateRequestLifecycle()", () => {
    it("should create a lifecycle for a request", () => {
      const lifecycle = ContextManager.getOrCreateRequestLifecycle("request-1");

      assert.ok(lifecycle);
      assert.ok(lifecycle.state);
      assert.equal(lifecycle.isHijacked, false);
      assert.ok(lifecycle.timestamps.receivedAt);
    });

    it("should return the same lifecycle for the same request ID", () => {
      const first = ContextManager.getOrCreateRequestLifecycle("request-1");

      const second = ContextManager.getOrCreateRequestLifecycle("request-1");

      assert.equal(first, second);
    });

    it("should create different lifecycles for different request IDs", () => {
      const first = ContextManager.getOrCreateRequestLifecycle("request-1");

      const second = ContextManager.getOrCreateRequestLifecycle("request-2");

      assert.notEqual(first, second);
    });

    it("should initialize each lifecycle with a fresh state store", () => {
      const first = ContextManager.getOrCreateRequestLifecycle("request-1");

      const second = ContextManager.getOrCreateRequestLifecycle("request-2");

      assert.notEqual(first.state, second.state);
    });
  });
  describe("getOrCreateScope()", () => {
    it("should create a complete request scope", () => {
      const socket = createSocket();

      const req = {
        method: "GET",
        url: "/test",
        headers: {
          host: "example.com",
        },
      } as any;

      const scope = ContextManager.getOrCreateScope(socket, req, "h1");

      assert.ok(scope.session);
      assert.ok(scope.request);
      assert.ok(scope.lifecycle);

      assert.equal(scope.session.socket, socket);
      assert.equal(scope.request.client.req, req);

      assert.equal(
        scope.request.requestId,
        scope.lifecycle ? scope.request.requestId : undefined,
      );
    });

    it("should reuse the same scope components for the same session and stream", () => {
      const socket = createSocket();

      const first = ContextManager.getOrCreateScope(socket, undefined, "h1");

      const second = ContextManager.getOrCreateScope(socket, undefined, "h1");

      assert.equal(first.session, second.session);
      assert.equal(first.request, second.request);
      assert.equal(first.lifecycle, second.lifecycle);
    });

    it("should create separate request contexts for separate streams", () => {
      const socket = createSocket();

      const first = ContextManager.getOrCreateScope(socket, undefined, 1);

      const second = ContextManager.getOrCreateScope(socket, undefined, 3);

      assert.equal(first.session, second.session);

      assert.notEqual(first.request, second.request);
      assert.notEqual(first.lifecycle, second.lifecycle);

      assert.notEqual(first.request.requestId, second.request.requestId);
    });

    it("should create separate scopes for separate sockets", () => {
      const socket1 = createSocket();
      const socket2 = createSocket();

      const first = ContextManager.getOrCreateScope(socket1, undefined, "h1");

      const second = ContextManager.getOrCreateScope(socket2, undefined, "h1");

      assert.notEqual(first.session, second.session);
      assert.notEqual(first.request, second.request);
      assert.notEqual(first.lifecycle, second.lifecycle);
    });
    it("should create a new scope for a new H1 transaction on the same socket", () => {
      const socket = createSocket();

      const req1 = {
        method: "GET",
        url: "/first",
        headers: { host: "example.com" },
      } as any;

      const req2 = {
        method: "GET",
        url: "/second",
        headers: { host: "example.com" },
      } as any;

      const first = ContextManager.getOrCreateScope(socket, req1, "h1");

      ContextManager.destroyRequestLifecycle(first.request.requestId);

      const second = ContextManager.getOrCreateScope(socket, req2, "h1");

      assert.notEqual(first.request, second.request);
      assert.notEqual(first.request.requestId, second.request.requestId);

      assert.equal(second.request.client.req, req2);
      assert.equal(second.request.client.url, "/second");

      socket.destroy();
    });
  });
  describe("destroyRequestLifecycle()", () => {
    it("should remove a lifecycle from the lifecycle index", () => {
      const lifecycle = ContextManager.getOrCreateRequestLifecycle("request-1");

      assert.ok(lifecycle);

      ContextManager.destroyRequestLifecycle("request-1");

      const newLifecycle =
        ContextManager.getOrCreateRequestLifecycle("request-1");

      assert.notEqual(newLifecycle, lifecycle);
    });
  });
});
