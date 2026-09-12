import assert from "node:assert/strict";
import http from "node:http";
import { PassThrough } from "node:stream";
import { UpstreamInitiator } from "../../src/core/transport/http1/UpstreamInitiator";

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
      },
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

    // Provide a simple handler so the request doesn't hang in mid-air
    server.once("request", (_req, res) => {
      res.end("ok");
    });

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL(`http://127.0.0.1:${port}/submit`),
      scope,
    );

    assert.equal(upstream.method, "POST");

    scope.request.client.req.end();
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

    const upstream = await UpstreamInitiator.initH1UpstreamReq(
      new URL("http://127.0.0.1:1/failure"),
      scope,
    );

    scope.request.client.req.end();

    await statusCodePromise;

    assert.equal(response.statusCode, 502);

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
  });
});
