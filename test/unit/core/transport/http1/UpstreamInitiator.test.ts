import assert from "node:assert/strict";
import http, { ClientRequest } from "node:http";
import { EventEmitter, PassThrough } from "node:stream";
import { UpstreamInitiator } from "../../../../../src/core/transport/http1/UpstreamInitiator";
import { pluginEventManager } from "../../../../../src/core/event/plugin-events/pluginEvents";
import { H1OutboundBridge } from "../../../../../src/core/transport/http1/H1OutboundBridge";
import { PipelineAbortSignal } from "../../../../../src/core/signals/pipelineAbortSignal";

class MockServerResponse extends PassThrough {
  statusCode = 200;
  headersSent = false;
  writableEnded = false;

  override end(
    chunk?: any,
    encoding?: BufferEncoding | (() => void),
    callback?: () => void,
  ): this {
    this.headersSent = true;
    this.writableEnded = true;

    return super.end(chunk, encoding as any, callback);
  }
}

describe("UpstreamInitiator", () => {
  let server: http.Server;
  let port: number;

  const createConfig = () =>
    ({
      useResponseCache: false,
    }) as any;

  beforeEach(async () => {
    server = http.createServer();

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    port = (server.address() as any).port;
  });

  afterEach(async () => {
    // Forcefully destroy lingering sockets to prevent close hooks from hanging
    server.closeAllConnections();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  function createScope() {
    const clientReq = new PassThrough() as any;
    const clientRes = new MockServerResponse();
    clientReq.method = "GET";
    clientReq.headers = {
      host: "original.test",
      "user-agent": "test-agent",
    };

    return {
      request: {
        client: {
          req: clientReq,
          res: clientRes,
        },
        upstream: {
          req: new PassThrough(),
        },
      },
      lifecycle: { timestamps: {} },
    } as any;
  }

  it("should create an HTTP upstream request", async () => {
    const scope = createScope();

    const requestCompleted = new Promise<void>((resolve) => {
      server.once("request", (_req, res) => {
        res.end("ok");
        resolve();
      });
    });

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL(`http://127.0.0.1:${port}/hello?x=1`),
      scope,
    );

    assert.ok(upstream);
    assert.equal(upstream.method, "GET");

    // Signal end of request to close stream loops cleanly
    scope.request.client.req.end();
    await requestCompleted;

    upstream.destroy();
  });

  it("should preserve the client HTTP method", async () => {
    const scope = createScope();
    scope.request.client.req.method = "POST";

    server.once("request", (_req, res) => {
      res.end("ok");
    });

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL(`http://127.0.0.1:${port}/submit`),
      scope,
    );

    assert.equal(upstream.method, "POST");

    const requestFinished = new Promise<void>((resolve) => {
      upstream.once("finish", resolve);
    });

    scope.request.client.req.end();

    await requestFinished;

    upstream.destroy();
  });

  it("should use the target hostname and path", async () => {
    const scope = createScope();

    const received = new Promise<{
      host: string | undefined;
      url: string | undefined;
    }>((resolve) => {
      server.once("request", (req, res) => {
        resolve({
          host: req.headers.host,
          url: req.url,
        });
        res.end("ok");
      });
    });

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL(`http://127.0.0.1:${port}/target/path?a=1`),
      scope,
    );

    // End client request to flush data through the pipeline
    scope.request.client.req.end("body");

    const data = await received;

    assert.equal(data.host, `127.0.0.1:${port}`);
    assert.equal(data.url, "/target/path?a=1");

    upstream.destroy();
  });

  it("should propagate client headers to the upstream request", async () => {
    const scope = createScope();

    const receivedHeaders = new Promise<Record<string, any>>((resolve) => {
      server.once("request", (req, res) => {
        resolve(req.headers);
        res.end("ok");
      });
    });

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL(`http://127.0.0.1:${port}/headers`),
      scope,
    );

    scope.request.client.req.end();
    const headers = await receivedHeaders;

    assert.equal(headers["user-agent"], "test-agent");
    assert.equal(headers.host, `127.0.0.1:${port}`);

    upstream.destroy();
  });

  it("should reject when the client request is missing", async () => {
    const scope = {
      request: {
        client: {
          req: undefined,
          res: undefined,
        },
      },
    } as any;

    await assert.rejects(
      () =>
        UpstreamInitiator.initH1UpstreamReq(
          new URL("http://127.0.0.1:80/test"),
          scope,
        ),
      /Client request is missing/,
    );
  });

  it("should handle upstream connection failure", async () => {
    const scope = createScope();

    const response = scope.request.client.res;

    const statusCodePromise = new Promise<number>((resolve) => {
      response.once("finish", () => {
        resolve(response.statusCode);
      });
    });

    let endCalls = 0;

    const originalEnd = response.end.bind(response);

    response.end = ((...args: any[]) => {
      endCalls++;
      return originalEnd(...args);
    }) as typeof response.end;

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL("http://127.0.0.1:1/failure"),
      scope,
    );

    scope.request.client.req.end();

    await statusCodePromise;

    assert.equal(response.statusCode, 502);
    assert.equal(endCalls, 1, "Failure response should be sent exactly once");
    upstream.destroy();
  });

  it("should remove client disconnect listeners after upstream failure response finishes", async () => {
    const scope = createScope();
    const clientReq = scope.request.client.req;
    const clientRes = scope.request.client.res;

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL("http://127.0.0.1:1/failure"),
      scope,
    );

    clientReq.end();

    await new Promise<void>((resolve) => {
      clientRes.once("finish", resolve);
    });

    assert.equal(clientReq.listenerCount("aborted"), 0);
    assert.equal(clientRes.listenerCount("close"), 0);
    assert.equal(clientRes.listenerCount("finish"), 0);

    upstream.destroy();
  });

  it("should return Bad Gateway on upstream failure", async () => {
    const scope = createScope();

    const response = scope.request.client.res;

    const bodyPromise = new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk));
      });

      response.once("end", () => {
        resolve(Buffer.concat(chunks));
      });
    });

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL("http://127.0.0.1:1/failure"),
      scope,
    );

    scope.request.client.req.end();

    const body = await bodyPromise;

    assert.equal(body.toString(), "Bad Gateway");

    upstream.destroy();
  });

  it("should not overwrite an already-sent client response on upstream failure", async () => {
    const scope = createScope();

    const response = scope.request.client.res;

    response.headersSent = true;

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL("http://127.0.0.1:1/failure"),
      scope,
    );

    scope.request.client.req.end();

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(response.statusCode, 200);

    upstream.destroy();
  });

  it("should destroy the upstream request when the client response closes", async () => {
    const scope = createScope();

    const response = scope.request.client.res;
    let responseEndCalls = 0;

    const originalEnd = response.end.bind(response);

    response.end = ((...args: any[]) => {
      responseEndCalls++;
      return originalEnd(...args);
    }) as typeof response.end;

    server.once("request", () => {
      // Keep the upstream request open.
    });

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL(`http://127.0.0.1:${port}/long-running`),
      scope,
    );

    const destroyed = new Promise<void>((resolve) => {
      upstream.once("close", resolve);
    });

    scope.request.client.res.emit("close");

    await destroyed;

    assert.equal(upstream.destroyed, true);
    assert.equal(responseEndCalls, 0);
    assert.equal(scope.request.client.req.listenerCount("aborted"), 0);
    assert.equal(scope.request.client.res.listenerCount("close"), 0);
    assert.equal(scope.request.client.res.listenerCount("finish"), 0);
  });

  it("should skip the default request pipeline when upstream-connect is hijacked", async () => {
    const scope = createScope();
    scope.lifecycle.isHijacked = false;

    const originalEmitAsync = pluginEventManager.emitAsync;

    let requestReceived = false;
    let resolvePluginEvent!: () => void;

    const pluginEventCompleted = new Promise<void>((resolve) => {
      resolvePluginEvent = resolve;
    });

    server.once("request", (_req, res) => {
      requestReceived = true;
      res.end("ok");
    });

    pluginEventManager.emitAsync = (async (eventName: any, payload: any) => {
      if (eventName === "proxy:upstream-connect") {
        payload.scope.lifecycle.isHijacked = true;
        resolvePluginEvent();
      }
    }) as typeof pluginEventManager.emitAsync;

    let upstream: ClientRequest | undefined;

    try {
      upstream = await UpstreamInitiator.initH1UpstreamReq(
        new URL(`http://127.0.0.1:${port}/hijack`),
        scope,
      );

      scope.request.client.req.end();

      await pluginEventCompleted;

      // Allow the async connect continuation to finish.
      await new Promise<void>((resolve) => setImmediate(resolve));

      assert.equal(scope.lifecycle.isHijacked, true);
      assert.equal(requestReceived, false);
      assert.equal(upstream.destroyed, false);
    } finally {
      pluginEventManager.emitAsync = originalEmitAsync;

      upstream?.destroy();
      scope.request.client.req.destroy();
    }
  });

  it("should not destroy upstream request on client disconnect after hijacking", async () => {
    const scope = createScope();
    scope.lifecycle.isHijacked = false;

    const clientSocket = new EventEmitter();
    scope.request.client.req.socket = clientSocket;

    const originalEmitAsync = pluginEventManager.emitAsync;

    let resolvePluginEvent!: () => void;

    const pluginEventCompleted = new Promise<void>((resolve) => {
      resolvePluginEvent = resolve;
    });

    pluginEventManager.emitAsync = (async (eventName: any, payload: any) => {
      if (eventName === "proxy:upstream-connect") {
        payload.scope.lifecycle.isHijacked = true;
        resolvePluginEvent();
      }
    }) as typeof pluginEventManager.emitAsync;

    let upstream: ClientRequest | undefined;

    try {
      upstream = await UpstreamInitiator.initH1UpstreamReq(
        new URL(`http://127.0.0.1:${port}/hijack-cleanup`),
        scope,
      );

      await pluginEventCompleted;

      clientSocket.emit("close");

      assert.equal(scope.lifecycle.isHijacked, true);
      assert.equal(upstream.destroyed, false);
    } finally {
      pluginEventManager.emitAsync = originalEmitAsync;
      upstream?.destroy();
      scope.request.client.req.destroy();
    }
  });

  it("should preserve upstream request when client response closes after hijacking", async () => {
    const scope = createScope();
    scope.lifecycle.isHijacked = true;

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL(`http://127.0.0.1:${port}/hijacked-response-close`),
      scope,
    );

    scope.request.client.res.emit("close");

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(upstream.destroyed, false);

    upstream.destroy();
  });

  it("should preserve client socket while sending upstream failure response", async () => {
    const scope = createScope();
    const clientSocket = new PassThrough();

    scope.request.client.req.socket = clientSocket;

    const response = scope.request.client.res;

    const bodyPromise = new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk));
      });

      response.once("end", () => {
        resolve(Buffer.concat(chunks));
      });
    });

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL("http://127.0.0.1:1/failure"),
      scope,
    );

    scope.request.client.req.end();

    const body = await bodyPromise;

    assert.equal(body.toString(), "Bad Gateway");
    assert.equal(clientSocket.destroyed, false);

    upstream.destroy();
    clientSocket.destroy();
  });

  it("should destroy upstream request when client request is aborted", async () => {
    const scope = createScope();

    server.once("request", () => {
      // Keep upstream request open.
    });

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL(`http://127.0.0.1:${port}/client-aborted`),
      scope,
    );

    const destroyed = new Promise<void>((resolve) => {
      upstream.once("close", resolve);
    });

    // Simulate an incomplete client request.
    scope.request.client.req.emit("aborted");

    await destroyed;

    assert.equal(upstream.destroyed, true);
    assert.equal(scope.request.client.req.listenerCount("aborted"), 0);
    assert.equal(scope.request.client.res.listenerCount("close"), 0);
    assert.equal(scope.request.client.res.listenerCount("finish"), 0);
  });

  it("should propagate upstream-connect PipelineAbortSignal without mutating lifecycle", async () => {
    const scope = createScope();
    const server = http.createServer();

    const originalEmitAsync = pluginEventManager.emitAsync;

    const abortSignal = new PipelineAbortSignal({
      message: "Blocked during upstream connection",
      reason: "plugin",
      event: "proxy:upstream-connect",
    });

    let connectEventCalled = false;

    try {
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
      });

      const port = (server.address() as any).port;

      pluginEventManager.emitAsync = (async (eventName: any) => {
        if (eventName === "proxy:upstream-connect") {
          connectEventCalled = true;
          throw abortSignal;
        }
      }) as typeof pluginEventManager.emitAsync;

      const upstreamReq = await UpstreamInitiator.initH1UpstreamReq(
        new URL(`http://127.0.0.1:${port}/abort-test`),
        scope,
      );

      scope.request.upstream.req = upstreamReq;

      const bridgeResult = new Promise<void>((resolve, reject) => {
        H1OutboundBridge.execute(scope, createConfig(), resolve, reject);
      });

      await assert.rejects(bridgeResult, (error) => error === abortSignal);

      assert.equal(connectEventCalled, true);

      // UpstreamInitiator and H1OutboundBridge must not own this mutation.
      assert.equal(scope.lifecycle.abort, undefined);
      assert.equal(scope.lifecycle.failure, undefined);
    } finally {
      pluginEventManager.emitAsync = originalEmitAsync;
      server.closeAllConnections();

      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  });
});
