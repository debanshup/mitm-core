import assert from "node:assert/strict";
import { describe, it, afterEach } from "mocha";

import { StateStore } from "../../../src/core/state/StateStore";
import { BaseHandler } from "../../../src/core/handlers/base/base.handler";
import type { RequestScope } from "../../../src/core/scope/types";
import type { ProxyConfig } from "../../../src/lib/Proxy";
import Pipeline from "../../../src/core/pipelines/PipelineCompiler";
import { PipelineAbortSignal } from "../../../src/core/signals/pipelineAbortSignal";
import { Duplex } from "node:stream";

const config = {} as ProxyConfig;

function createScope(): RequestScope {
  const socket = new Duplex({
    read() {},
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  return {
    session: {
      connectionId: "test-connection",
      socket,
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

class FirstHandler extends BaseHandler {
  readonly phase = "request" as const;
  readonly config = config;

  async handle(scope: RequestScope): Promise<void> {
    scope.lifecycle.state.set("request.cacheHit", true);
  }
}

class SecondHandler extends BaseHandler {
  readonly phase = "request" as const;
  readonly config = config;

  async handle(scope: RequestScope): Promise<void> {
    assert.equal(scope.lifecycle.state.get("request.cacheHit"), true);
  }
}

describe("Pipeline", () => {
  afterEach(() => {
    Pipeline.setPipelineForTest("request", []);
  });

  describe("run()", () => {
    it("should execute handlers sequentially and propagate scope mutations", async () => {
      const scope = createScope();

      Pipeline.setPipelineForTest("request", [
        new FirstHandler(),
        new SecondHandler(),
      ]);

      await Pipeline.run(scope);

      assert.equal(scope.lifecycle.state.get("request.cacheHit"), true);
    });
    it("should do nothing when there is no next phase", async () => {
      const scope = createScope();

      scope.lifecycle.nextPhase = undefined;

      let executed = false;

      class TestHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executed = true;
        }
      }

      Pipeline.setPipelineForTest("request", [new TestHandler()]);

      await Pipeline.run(scope);

      assert.equal(executed, false);
    });
    it("should stop the pipeline when the request is hijacked", async () => {
      const scope = createScope();

      scope.lifecycle.isHijacked = true;

      let executed = false;

      class TestHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executed = true;
        }
      }

      Pipeline.setPipelineForTest("request", [new TestHandler()]);

      await Pipeline.run(scope);

      assert.equal(executed, false);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
    it("should continue into the next phase when a handler changes nextPhase", async () => {
      const scope = createScope();

      const executionOrder: string[] = [];

      class RequestHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(scope: RequestScope): Promise<void> {
          executionOrder.push("request");

          scope.lifecycle.nextPhase = "response";
        }
      }

      class ResponseHandler extends BaseHandler {
        readonly phase = "response" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("response");
        }
      }

      Pipeline.setPipelineForTest("request", [new RequestHandler()]);

      Pipeline.setPipelineForTest("response", [new ResponseHandler()]);

      await Pipeline.run(scope);

      assert.deepEqual(executionOrder, ["request", "response"]);
    });
    it("should execute handlers in registration order", async () => {
      const scope = createScope();

      const executionOrder: string[] = [];

      class FirstHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("first");
        }
      }

      class SecondHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("second");
        }
      }

      class ThirdHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("third");
        }
      }

      Pipeline.setPipelineForTest("request", [
        new FirstHandler(),
        new SecondHandler(),
        new ThirdHandler(),
      ]);

      await Pipeline.run(scope);

      assert.deepEqual(executionOrder, ["first", "second", "third"]);
    });
    it("should wait for each handler before executing the next", async () => {
      const scope = createScope();

      const executionOrder: string[] = [];

      class FirstHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 10));
          executionOrder.push("first");
        }
      }

      class SecondHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("second");
        }
      }

      Pipeline.setPipelineForTest("request", [
        new FirstHandler(),
        new SecondHandler(),
      ]);

      await Pipeline.run(scope);

      assert.deepEqual(executionOrder, ["first", "second"]);
    });
    it("should stop execution when a handler throws PipelineAbortSignal", async () => {
      const scope = createScope();

      const executionOrder: string[] = [];

      class FirstHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("first");

          throw new PipelineAbortSignal("request intentionally aborted");
        }
      }

      class SecondHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("second");
        }
      }

      Pipeline.setPipelineForTest("request", [
        new FirstHandler(),
        new SecondHandler(),
      ]);

      await Pipeline.run(scope);

      assert.deepEqual(executionOrder, ["first"]);

      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
    it("should not write a proxy error when pipeline is intentionally aborted", async () => {
      const scope = createScope();

      let responseEnded = false;

      scope.request.client.res = {
        headersSent: false,
        writableEnded: false,
        end() {
          responseEnded = true;
        },
      } as any;

      class AbortHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          throw new PipelineAbortSignal();
        }
      }

      Pipeline.setPipelineForTest("request", [new AbortHandler()]);

      await Pipeline.run(scope);

      assert.equal(responseEnded, false);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
    it("should return 502 when a handler throws an unexpected error", async () => {
      const scope = createScope();

      let statusCode: number | undefined;
      let responseBody: string | undefined;

      scope.request.client.res = {
        headersSent: false,
        writableEnded: false,

        set statusCode(value: number) {
          statusCode = value;
        },

        end(body?: string) {
          responseBody = body;
        },
      } as any;

      class FailingHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          throw new Error("handler failed");
        }
      }

      Pipeline.setPipelineForTest("request", [new FailingHandler()]);

      await Pipeline.run(scope);

      assert.equal(statusCode, 502);
      assert.equal(responseBody, "Proxy Error: Plugin Failure");
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
    it("should stop executing handlers after an unexpected error", async () => {
      const scope = createScope();

      const executionOrder: string[] = [];

      scope.request.client.res = {
        headersSent: false,
        writableEnded: false,

        end() {
          // no-op
        },
      } as any;

      class FailingHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("failing");
          throw new Error("handler failed");
        }
      }

      class LaterHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("later");
        }
      }

      Pipeline.setPipelineForTest("request", [
        new FailingHandler(),
        new LaterHandler(),
      ]);

      await Pipeline.run(scope);

      assert.deepEqual(executionOrder, ["failing"]);

      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
    it("should handle ECONNRESET without logging a handler error", async () => {
      const scope = createScope();

      let statusCode: number | undefined;

      scope.request.client.res = {
        headersSent: false,
        writableEnded: false,

        set statusCode(value: number) {
          statusCode = value;
        },

        end() {
          // no-op
        },
      } as any;

      class NetworkErrorHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          const error = new Error("connection reset");
          (error as Error & { code?: string }).code = "ECONNRESET";

          throw error;
        }
      }

      Pipeline.setPipelineForTest("request", [new NetworkErrorHandler()]);

      await Pipeline.run(scope);

      assert.equal(statusCode, 502);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
    it("should stop when the current phase has no handlers", async () => {
      const scope = createScope();

      Pipeline.setPipelineForTest("request", []);

      await Pipeline.run(scope);

      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
    it("should stop an infinite phase loop after the maximum number of jumps", async () => {
      const scope = createScope();

      let executionCount = 0;

      scope.request.target.originalHost = "loop.test";

      class LoopHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(scope: RequestScope): Promise<void> {
          executionCount++;

          // Keep the pipeline in the same phase forever.
          scope.lifecycle.nextPhase = "request";
        }
      }

      Pipeline.setPipelineForTest("request", [new LoopHandler()]);

      await Pipeline.run(scope);

      assert.equal(executionCount, 10);
      assert.equal(scope.lifecycle.nextPhase, undefined);
      assert.equal(scope.lifecycle.isHijacked, true);
    });
    it("should return 508 when an infinite phase loop is detected", async () => {
      const scope = createScope();

      let statusCode: number | undefined;
      let responseBody: string | undefined;

      scope.request.target.originalHost = "loop.test";

      scope.request.client.res = {
        headersSent: false,
        writableEnded: false,

        writeHead(status: number) {
          statusCode = status;
        },

        end(body?: string) {
          responseBody = body;
        },
      } as any;

      class LoopHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(scope: RequestScope): Promise<void> {
          scope.lifecycle.nextPhase = "request";
        }
      }

      Pipeline.setPipelineForTest("request", [new LoopHandler()]);

      await Pipeline.run(scope);

      assert.equal(statusCode, 508);
      assert.ok(responseBody);
      assert.match(responseBody!, /Loop Detected/);

      assert.equal(scope.lifecycle.nextPhase, undefined);
      assert.equal(scope.lifecycle.isHijacked, true);
    });
    it("should clear a pending phase when a handler fails", async () => {
      const scope = createScope();

      let statusCode: number | undefined;

      scope.request.client.res = {
        headersSent: false,
        writableEnded: false,

        set statusCode(value: number) {
          statusCode = value;
        },

        end() {
          // no-op
        },
      } as any;

      class FailingHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(scope: RequestScope): Promise<void> {
          scope.lifecycle.nextPhase = "response";

          throw new Error("handler failed");
        }
      }

      Pipeline.setPipelineForTest("request", [new FailingHandler()]);

      await Pipeline.run(scope);

      assert.equal(statusCode, 502);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
  });
});
