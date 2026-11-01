import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { describe, it, afterEach } from "mocha";

import { ContextManager } from "../../../src/core/scope/ContextManager";

function createRequestContext() {
  const session = {
    connectionId: crypto.randomUUID(),
    socket: new PassThrough(),
    protocol: {},
  };

  return ContextManager.getOrCreateRequestContext(session);
}

describe("ContextManager cleanup", () => {
  afterEach(() => {
    ContextManager.destroyActiveRequests();
  });

  it("should destroy upstream requests and client responses", () => {
    const request = createRequestContext();

    let upstreamDestroyed = false;
    let clientResponseDestroyed = false;

    request.upstream.req = {
      destroyed: false,
      destroy() {
        upstreamDestroyed = true;
      },
    } as any;

    request.client.res = {
      destroyed: false,
      destroy() {
        clientResponseDestroyed = true;
      },
    } as any;

    ContextManager.destroyActiveRequests();

    assert.equal(upstreamDestroyed, true);
    assert.equal(clientResponseDestroyed, true);
  });

  it("should clear all active requests", () => {
    createRequestContext();
    createRequestContext();

    assert.equal(ContextManager.getActiveRequests().length, 2);

    ContextManager.destroyActiveRequests();

    assert.equal(ContextManager.getActiveRequests().length, 0);
  });

  it("should not destroy already destroyed resources", () => {
    const request = createRequestContext();

    let destroyCount = 0;

    request.upstream.req = {
      destroyed: true,
      destroy() {
        destroyCount++;
      },
    } as any;

    request.client.res = {
      destroyed: true,
      destroy() {
        destroyCount++;
      },
    } as any;

    ContextManager.destroyActiveRequests();

    assert.equal(destroyCount, 0);
  });

  it("should safely handle repeated cleanup", () => {
    createRequestContext();

    ContextManager.destroyActiveRequests();
    ContextManager.destroyActiveRequests();

    assert.equal(ContextManager.getActiveRequests().length, 0);
  });

  it("should continue cleaning resources when one destroy operation throws", () => {
    const request = createRequestContext();

    let upstreamResDestroyed = false;
    let clientResDestroyed = false;

    request.upstream.req = {
      destroyed: false,
      destroy() {
        throw new Error("Cleanup failed");
      },
    } as any;

    request.upstream.res = {
      destroyed: false,
      destroy() {
        upstreamResDestroyed = true;
      },
    } as any;

    request.client.res = {
      destroyed: false,
      destroy() {
        clientResDestroyed = true;
      },
    } as any;

    assert.doesNotThrow(() => {
      ContextManager.destroyActiveRequests();
    });

    assert.equal(upstreamResDestroyed, true);
    assert.equal(clientResDestroyed, true);
    assert.equal(ContextManager.getActiveRequests().length, 0);
  });

  it("should continue cleaning other requests when one request cleanup fails", () => {
    const failingRequest = createRequestContext();
    const healthyRequest = createRequestContext();

    let healthyUpstreamDestroyed = false;
    let healthyClientResponseDestroyed = false;

    failingRequest.upstream.req = {
      destroyed: false,
      destroy() {
        throw new Error("Cleanup failed");
      },
    } as any;

    healthyRequest.upstream.req = {
      destroyed: false,
      destroy() {
        healthyUpstreamDestroyed = true;
      },
    } as any;

    healthyRequest.client.res = {
      destroyed: false,
      destroy() {
        healthyClientResponseDestroyed = true;
      },
    } as any;

    assert.doesNotThrow(() => {
      ContextManager.destroyActiveRequests();
    });

    assert.equal(healthyUpstreamDestroyed, true);
    assert.equal(healthyClientResponseDestroyed, true);
    assert.equal(ContextManager.getActiveRequests().length, 0);
  });
});
