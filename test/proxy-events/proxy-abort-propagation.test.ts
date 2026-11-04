import { strict as assert } from "node:assert";
import { describe, it } from "mocha";

import {
  proxyEventManager,
  type ProxyEventMap,
} from "../../src/core/event/proxy-events/proxyEvents";

import { PipelineAbortSignal } from "../../src/core/signals/pipelineAbortSignal";
import type { RequestScope } from "../../src/core/scope/types";
import type Stream from "stream";
import type { Socket } from "net";

type ProxyEventCase = {
  event: keyof ProxyEventMap;
  args: unknown[];
};

const scope = {} as RequestScope;
const socket = {} as Socket;
const duplex = {} as Stream.Duplex;
const error = new Error("Test error");

const proxyEvents: ProxyEventCase[] = [
  {
    event: "connection:open",
    args: [{ socket }],
  },
  {
    event: "connect:request",
    args: [{ scope, socket: duplex, head: Buffer.alloc(0) }],
  },
  {
    event: "connect:before",
    args: [{ scope, socket: duplex }],
  },
  {
    event: "connect:established",
    args: [{ scope, socket: duplex }],
  },
  {
    event: "http:request",
    args: [{ scope }],
  },
  {
    event: "https:request",
    args: [{ scope }],
  },
  {
    event: "error",
    args: [error],
  },
  {
    event: "ws:request",
    args: [{ scope, socket: duplex, head: Buffer.alloc(0) }],
  },
  {
    event: "ws:established",
    args: [{ scope }],
  },
  {
    event: "ws:client-message",
    args: [{ scope, data: Buffer.from("client"), isBinary: false }],
  },
  {
    event: "ws:upstream-message",
    args: [{ scope, data: Buffer.from("upstream"), isBinary: false }],
  },
  {
    event: "ws:close",
    args: [
      {
        scope,
        direction: "client",
        code: 1000,
        reason: Buffer.alloc(0),
      },
    ],
  },
  {
    event: "ws:error",
    args: [
      {
        scope,
        direction: "client",
        error,
      },
    ],
  },
];

describe("Proxy Event Abort Propagation", function () {
  for (const { event, args } of proxyEvents) {
    it(`should propagate PipelineAbortSignal from ${event}`, async function () {
      const abortSignal = new PipelineAbortSignal({
        message: `Intentional abort from ${event}`,
        event,
        reason: "plugin",
      });

      let invocationCount = 0;

      const listener = () => {
        invocationCount++;
        throw abortSignal;
      };

      const emitter = proxyEventManager as any;

      emitter.on(event, listener);

      try {
        await assert.rejects(
          emitter.emitAsync(event, ...args),
          (caughtError: unknown) => {
            assert.strictEqual(caughtError, abortSignal);
            return true;
          },
        );

        assert.equal(invocationCount, 1);
      } finally {
        emitter.off(event, listener);
      }
    });
  }
});
