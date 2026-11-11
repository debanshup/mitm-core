import assert from "node:assert/strict";
import { describe, it, afterEach } from "mocha";

import { StateStore } from "../../../src/core/state/StateStore";
import { BaseHandler } from "../../../src/core/handlers/base/base.handler";
import type { RequestScope } from "../../../src/core/scope/types";
import Pipeline from "../../../src/core/pipelines/PipelineCompiler";
import { PipelineAbortSignal } from "../../../src/core/signals/pipelineAbortSignal";
import { Duplex } from "node:stream";
import type { ProxyConfig } from "../../../src/config.registry";
import { WSOutboundBridge } from "../../../src/core/transport/ws/WSOutboundBridge";
import type { Phase } from "../../../src/phase/Phase";

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

      assert.equal(
        scope.lifecycle.abort?.message,
        "request intentionally aborted",
      );

      assert.equal(scope.lifecycle.abort?.phase, "request");
      assert.ok(scope.lifecycle.abort?.abortedAt);
      assert.equal(scope.lifecycle.isHijacked, false);
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
      assert.equal(scope.lifecycle.isHijacked, false);

      assert.ok(scope.lifecycle.failure);

      assert.equal(
        scope.lifecycle.failure.message,
        "Infinite pipeline phase loop detected",
      );

      assert.equal(scope.lifecycle.failure.phase, "request");
      assert.ok(scope.lifecycle.failure.failedAt > 0);
      assert.equal(scope.lifecycle.failure.disposition, "terminal");
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
      assert.equal(scope.lifecycle.isHijacked, false);
      assert.equal(scope.lifecycle.nextPhase, undefined);

      const failure = scope.lifecycle.failure;

      assert.ok(failure);
      assert.equal(failure.message, "Infinite pipeline phase loop detected");
      assert.equal(failure.phase, "request");
      assert.ok(failure.failedAt > 0);
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

    it("should record abort metadata when a handler throws PipelineAbortSignal", async () => {
      const plugin = {} as any;

      const abortHandler = {
        name: "AbortHandler",
        handle: async () => {
          throw new PipelineAbortSignal({
            message: "Request blocked",
            reason: "policy",
            plugin,
            event: "proxy:client-http-request",
          });
        },
      } as any;

      Pipeline.setPipelineForTest("request", [abortHandler]);

      const scope = createScope();
      scope.lifecycle.nextPhase = "request";

      await Pipeline.run(scope);

      assert.equal(scope.lifecycle.abort?.message, "Request blocked");
      assert.equal(scope.lifecycle.abort?.reason, "policy");
      assert.equal(scope.lifecycle.abort?.plugin, plugin);
      assert.equal(scope.lifecycle.abort?.event, "proxy:client-http-request");
      assert.equal(scope.lifecycle.abort?.phase, "request");
      assert.ok(scope.lifecycle.abort?.abortedAt);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });

    it("should not mark an aborted request as hijacked", async () => {
      const handler = {
        name: "AbortHandler",
        handle: async () => {
          throw new PipelineAbortSignal("Request blocked");
        },
      } as any;

      Pipeline.setPipelineForTest("request", [handler]);

      const scope = createScope();
      scope.lifecycle.nextPhase = "request";

      await Pipeline.run(scope);

      assert.ok(scope.lifecycle.abort);
      assert.equal(scope.lifecycle.isHijacked, false);
    });

    it("should not execute handlers after a pipeline has been aborted", async () => {
      let executionCount = 0;

      const handler = {
        name: "AbortHandler",
        handle: async () => {
          throw new PipelineAbortSignal("Request blocked");
        },
      } as any;

      const nextHandler = {
        name: "NextHandler",
        handle: async () => {
          executionCount++;
        },
      } as any;

      Pipeline.setPipelineForTest("request", [handler, nextHandler]);

      const scope = createScope();
      scope.lifecycle.nextPhase = "request";

      await Pipeline.run(scope);

      // Simulate an accidental attempt to resume the same lifecycle.
      scope.lifecycle.nextPhase = "request";

      await Pipeline.run(scope);

      assert.equal(executionCount, 0);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });

    it("should not resume an aborted lifecycle", async () => {
      const scope = createScope();

      let executionCount = 0;

      class AbortHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executionCount++;
          throw new PipelineAbortSignal("request blocked");
        }
      }

      Pipeline.setPipelineForTest("request", [new AbortHandler()]);

      await Pipeline.run(scope);

      assert.equal(executionCount, 1);
      assert.ok(scope.lifecycle.abort);

      // Simulate an accidental attempt to resume the same lifecycle.
      scope.lifecycle.nextPhase = "request";

      await Pipeline.run(scope);

      assert.equal(executionCount, 1);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });

    it("should stop executing remaining handlers when a handler hijacks the request", async () => {
      const scope = createScope();

      let secondHandlerExecuted = false;

      class HijackHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(scope: RequestScope): Promise<void> {
          scope.lifecycle.isHijacked = true;
        }
      }

      class SecondHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(): Promise<void> {
          secondHandlerExecuted = true;
        }
      }

      Pipeline.setPipelineForTest("request", [
        new HijackHandler(),
        new SecondHandler(),
      ]);

      await Pipeline.run(scope);

      assert.equal(secondHandlerExecuted, false);
      assert.equal(scope.lifecycle.isHijacked, true);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });

    it("should record failure metadata when a handler throws an unexpected error", async () => {
      const scope = createScope();

      const error = new Error("handler failed");

      scope.request.client.res = {
        headersSent: false,
        writableEnded: false,

        set statusCode(_value: number) {},

        end() {},
      } as any;

      class FailingHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(): Promise<void> {
          throw error;
        }
      }

      Pipeline.setPipelineForTest("request", [new FailingHandler()]);

      await Pipeline.run(scope);

      assert.ok(scope.lifecycle.failure);

      assert.equal(scope.lifecycle.failure.message, "handler failed");
      assert.equal(scope.lifecycle.failure.phase, "request");
      assert.equal(scope.lifecycle.failure.cause, error);
      assert.ok(scope.lifecycle.failure.failedAt > 0);

      assert.equal(scope.lifecycle.nextPhase, undefined);
    });

    it("should record failure metadata for expected network errors", async () => {
      const errorCodes = [
        "ECONNRESET",
        "ETIMEDOUT",
        "ECONNREFUSED",
        "EPIPE",
        "ERR_TLS_HANDSHAKE_TIMEOUT",
      ];

      for (const code of errorCodes) {
        const scope = createScope();

        const error = Object.assign(new Error(`Network error: ${code}`), {
          code,
        });

        class NetworkErrorHandler extends BaseHandler {
          readonly phase = "request" as const;
          readonly config = config;

          async handle(): Promise<void> {
            throw error;
          }
        }

        Pipeline.setPipelineForTest("request", [new NetworkErrorHandler()]);

        await Pipeline.run(scope);

        const failure = scope.lifecycle.failure;

        assert.ok(failure, `Missing failure metadata for ${code}`);
        assert.equal(failure.message, error.message);
        assert.equal(failure.code, code);
        assert.equal(failure.phase, "request");
        assert.equal(failure.cause, error);
        assert.ok(failure.failedAt > 0);

        assert.equal(scope.lifecycle.nextPhase, undefined);
        assert.equal(scope.lifecycle.isHijacked, false);
        assert.equal(failure.disposition, "terminal");
      }
    });

    it("should record failure metadata for TLS handshake timeout messages", async () => {
      const scope = createScope();

      const error = new Error("TLS Handshake Timeout");

      class TLSHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(): Promise<void> {
          throw error;
        }
      }

      Pipeline.setPipelineForTest("request", [new TLSHandler()]);

      await Pipeline.run(scope);

      const failure = scope.lifecycle.failure;

      assert.ok(failure);
      assert.equal(failure.message, error.message);
      assert.equal(failure.code, undefined);
      assert.equal(failure.cause, error);
      assert.equal(failure.phase, "request");
      assert.equal(failure.disposition, "terminal");
    });

    it("should stop remaining handlers after a terminal failure", async () => {
      const scope = createScope();

      let secondHandlerExecuted = false;

      class FailingHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(): Promise<void> {
          throw new Error("Unrecoverable handler failure");
        }
      }

      class SecondHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(): Promise<void> {
          secondHandlerExecuted = true;
        }
      }

      scope.request.client.res = {
        headersSent: false,
        writableEnded: false,
        set statusCode(_value: number) {},
        end() {},
      } as any;

      Pipeline.setPipelineForTest("request", [
        new FailingHandler(),
        new SecondHandler(),
      ]);

      await Pipeline.run(scope);

      assert.equal(secondHandlerExecuted, false);
      assert.equal(scope.lifecycle.failure?.disposition, "terminal");
      assert.equal(scope.lifecycle.nextPhase, undefined);
      assert.equal(scope.lifecycle.isHijacked, false);
    });

    it("should preserve the client socket after a request-level failure", async () => {
      const scope = createScope();

      let responseEnded = false;
      let responseStatus = 0;

      scope.request.client.res = {
        headersSent: false,
        writableEnded: false,
        destroyed: false,
        set statusCode(value: number) {
          responseStatus = value;
        },
        end() {
          responseEnded = true;
        },
        destroy() {},
      } as any;

      class FailingHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(): Promise<void> {
          throw new Error("Upstream request failed");
        }
      }

      Pipeline.setPipelineForTest("request", [new FailingHandler()]);

      await Pipeline.run(scope);

      assert.equal(scope.lifecycle.failure?.scope, "request");
      assert.equal(scope.session.socket.destroyed, false);
      assert.equal(responseStatus, 502);
      assert.equal(responseEnded, true);
    });

    it("should destroy the client socket after a connection-level failure", async () => {
      const scope = createScope();

      scope.lifecycle.nextPhase = "handshake";

      class FailingHandler extends BaseHandler {
        readonly phase = "handshake" as const;
        readonly config = config;

        async handle(): Promise<void> {
          throw new Error("TLS handshake failed");
        }
      }

      Pipeline.setPipelineForTest("handshake", [new FailingHandler()]);

      await Pipeline.run(scope);

      assert.equal(scope.lifecycle.failure?.scope, "connection");
      assert.equal(scope.lifecycle.failure?.disposition, "terminal");
      assert.equal(scope.session.socket.destroyed, true);
    });

    it("should safely handle a string thrown by a handler", async () => {
      const scope = createScope();

      scope.request.client.res = {
        headersSent: false,
        writableEnded: false,
        end() {},
      } as any;

      class StringErrorHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(): Promise<void> {
          throw "unexpected failure";
        }
      }

      Pipeline.setPipelineForTest("request", [new StringErrorHandler()]);

      await assert.doesNotReject(() => Pipeline.run(scope));

      assert.equal(scope.lifecycle.failure?.message, "unexpected failure");
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });

    it("should preserve error metadata from a plain object", async () => {
      const scope = createScope();

      scope.request.client.res = {
        headersSent: false,
        writableEnded: false,
        end() {},
      } as any;

      class ObjectErrorHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(): Promise<void> {
          throw {
            code: "ECONNRESET",
            message: "connection reset",
          };
        }
      }

      Pipeline.setPipelineForTest("request", [new ObjectErrorHandler()]);

      await Pipeline.run(scope);

      assert.equal(scope.lifecycle.failure?.message, "connection reset");
      assert.equal(scope.lifecycle.failure?.code, "ECONNRESET");
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });

    it("should handle WebSocket bridge execution failures centrally", async () => {
      const scope = createScope();

      let response = "";

      scope.request.webSocket = {
        isUpgraded: false,
        rawUpgradeSocket: {
          destroyed: false,
          writable: true,
          end(data: string) {
            response = data;
          },
          destroy() {
            this.destroyed = true;
          },
        } as any,
      };

      // Missing client request makes WSOutboundBridge.execute reject.
      await Pipeline.run(scope);

      assert.ok(scope.lifecycle.failure);
      assert.equal(scope.lifecycle.failure.phase, "request");
      assert.equal(scope.lifecycle.failure.disposition, "terminal");
      assert.equal(scope.lifecycle.nextPhase, undefined);
      assert.match(response, /502 Bad Gateway/);
    });

    it("should stop remaining handlers when a handler hijacks the request", async () => {
      const scope = createScope();
      const executionOrder: string[] = [];

      class HijackHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(scope: RequestScope): Promise<void> {
          executionOrder.push("hijack");

          scope.lifecycle.isHijacked = true;
        }
      }

      class ShouldNotRunHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("should-not-run");
        }
      }

      Pipeline.setPipelineForTest("request", [
        new HijackHandler(),
        new ShouldNotRunHandler(),
      ]);

      await Pipeline.run(scope);

      assert.deepEqual(executionOrder, ["hijack"]);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });

    it("should not execute the next phase when a handler hijacks the request", async () => {
      const scope = createScope();
      const executionOrder: string[] = [];

      class HijackHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;

        async handle(scope: RequestScope): Promise<void> {
          executionOrder.push("request");
          scope.lifecycle.isHijacked = true;
          scope.lifecycle.nextPhase = "response";
        }
      }

      class ResponseHandler extends BaseHandler {
        readonly phase = "response" as const;
        readonly config = config;

        async handle(): Promise<void> {
          executionOrder.push("response");
        }
      }

      Pipeline.setPipelineForTest("request", [new HijackHandler()]);
      Pipeline.setPipelineForTest("response", [new ResponseHandler()]);

      await Pipeline.run(scope);

      assert.deepEqual(executionOrder, ["request"]);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });

    it("should continue executing handlers when a failure is marked as recoverable", async () => {
      const scope = createScope();
      const executionOrder: string[] = [];

      class RecoverableHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;
        async handle(scope: RequestScope): Promise<void> {
          executionOrder.push("recoverable-handler");
          // Setting a recoverable failure does not halt the pipeline
          scope.lifecycle.failure = {
            message: "Non-critical lookup failed",
            phase: "request",
            failedAt: Date.now(),
            disposition: "recoverable",
            scope: "request",
          };
        }
      }

      class NextHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;
        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("next-handler");
        }
      }

      Pipeline.setPipelineForTest("request", [
        new RecoverableHandler(),
        new NextHandler(),
      ]);

      await Pipeline.run(scope);

      // The next handler should execute because the failure was recoverable
      assert.deepEqual(executionOrder, ["recoverable-handler", "next-handler"]);
      assert.equal(scope.lifecycle.failure?.disposition, "recoverable");
    });

    it("should halt execution immediately if a handler sets a terminal failure without throwing", async () => {
      const scope = createScope();
      const executionOrder: string[] = [];

      class TerminalHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;
        async handle(scope: RequestScope): Promise<void> {
          executionOrder.push("terminal-handler");
          scope.lifecycle.failure = {
            message: "Critical error occurred",
            phase: "request",
            failedAt: Date.now(),
            disposition: "terminal", // Manually setting terminal
            scope: "request",
          };
        }
      }

      class ShouldNotRunHandler extends BaseHandler {
        readonly phase = "request" as const;
        readonly config = config;
        async handle(_scope: RequestScope): Promise<void> {
          executionOrder.push("should-not-run");
        }
      }

      Pipeline.setPipelineForTest("request", [
        new TerminalHandler(),
        new ShouldNotRunHandler(),
      ]);

      await Pipeline.run(scope);

      // Execution halts immediately after the terminal failure is set
      assert.deepEqual(executionOrder, ["terminal-handler"]);
      assert.equal(scope.lifecycle.failure?.disposition, "terminal");
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
  });
});

describe("PipelineCompiler - PipelineAbortSignal", () => {
  const phases: Phase[] = ["tcp", "handshake", "request", "response"];

  afterEach(() => {
    for (const phase of phases) {
      Pipeline.setPipelineForTest(phase, []);
    }
  });

  for (const phase of phases) {
    it(`should handle PipelineAbortSignal during ${phase} phase`, async () => {
      const signal = new PipelineAbortSignal({
        message: `Aborted during ${phase}`,
        reason: "plugin",
        event: "test:abort",
      });

      const scope: any = {
        request: {
          client: {},
          target: {},
        },
        lifecycle: {
          nextPhase: phase,
          abort: undefined,
          failure: undefined,
          isHijacked: false,
        },
      };

      Pipeline.setPipelineForTest(phase, [
        {
          name: "AbortHandler",
          handle: async () => {
            throw signal;
          },
        },
      ] as any);

      await Pipeline.run(scope);

      assert.equal(scope.lifecycle.abort.message, signal.message);
      assert.equal(scope.lifecycle.abort.reason, "plugin");
      assert.equal(scope.lifecycle.abort.event, "test:abort");
      assert.equal(scope.lifecycle.abort.phase, phase);

      assert.equal(scope.lifecycle.failure, undefined);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    });
  }

  it("should handle PipelineAbortSignal from WebSocket upgrade", async () => {
    const signal = new PipelineAbortSignal({
      message: "WebSocket upgrade aborted",
      reason: "plugin",
      event: "test:ws-abort",
    });

    const scope: any = {
      request: {
        client: {},
        target: {},
        webSocket: {
          isUpgraded: false,
        },
      },
      lifecycle: {
        nextPhase: "request",
        abort: undefined,
        failure: undefined,
        isHijacked: false,
      },
    };

    const originalExecute = WSOutboundBridge.execute;

    WSOutboundBridge.execute = async () => {
      throw signal;
    };

    try {
      await Pipeline.run(scope);

      assert.equal(scope.lifecycle.abort.message, signal.message);
      assert.equal(scope.lifecycle.abort.phase, "request");
      assert.equal(scope.lifecycle.abort.event, "test:ws-abort");

      assert.equal(scope.lifecycle.failure, undefined);
      assert.equal(scope.lifecycle.nextPhase, undefined);
    } finally {
      WSOutboundBridge.execute = originalExecute;
    }
  });
});
