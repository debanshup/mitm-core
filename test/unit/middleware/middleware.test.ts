import assert from "node:assert/strict";
import { Middleware } from "../../../src/middleware/middleware";
import { connectionEvents } from "../../../src/core/event/connection-events/connectionEvents";
import { pluginEventManager } from "../../../src/core/event/plugin-events/pluginEvents";
import { proxyEventManager } from "../../../src/core/event/proxy-events/proxyEvents";
import Pipeline from "../../../src/core/pipelines/PipelineCompiler";
import { ScopeMutator } from "../../../src/core/scope/ScopeMutator";

describe("Middleware hijack lifecycle", () => {
  afterEach(() => {
    connectionEvents.removeAllListeners();
    pluginEventManager.removeAllListeners();
    proxyEventManager.removeAllListeners();
  });

  it("should stop HTTP request processing when a plugin hijacks the request", async () => {
    const originalCompile = Pipeline.compile;
    const originalApply = ScopeMutator.applyHttpPlainState;

    const originalPluginEmit = pluginEventManager.emitAsync;
    const originalProxyEmit = proxyEventManager.emitAsync;
    const originalRun = Pipeline.run;

    const scope: any = {
      lifecycle: { isHijacked: false },
      request: { client: {} },
    };

    let proxyEventCalled = false;
    let pipelineCalled = false;

    try {
      Pipeline.compile = (() => {}) as typeof Pipeline.compile;
      ScopeMutator.applyHttpPlainState = (() => true) as any;

      pluginEventManager.emitAsync = (async (event: any) => {
        assert.equal(event, "proxy:client-http-request");
        scope.lifecycle.isHijacked = true;
      }) as typeof pluginEventManager.emitAsync;

      proxyEventManager.emitAsync = (async () => {
        proxyEventCalled = true;
      }) as typeof proxyEventManager.emitAsync;

      Pipeline.run = (async () => {
        pipelineCalled = true;
      }) as typeof Pipeline.run;

      Middleware.register({ initializePipelines: true });

      await connectionEvents.emitAsync("HTTP:PLAIN", {
        req: {} as any,
        res: {} as any,
        scope,
      });

      assert.equal(scope.lifecycle.isHijacked, true);
      assert.equal(proxyEventCalled, false);
      assert.equal(pipelineCalled, false);
    } finally {
      Pipeline.compile = originalCompile;
      ScopeMutator.applyHttpPlainState = originalApply;
      pluginEventManager.emitAsync = originalPluginEmit;
      proxyEventManager.emitAsync = originalProxyEmit;
      Pipeline.run = originalRun;
    }
  });

  it("should stop HTTPS request processing when a plugin hijacks the request", async () => {
    const originalCompile = Pipeline.compile;
    const originalApply = ScopeMutator.applyHttpsDecryptedState;

    const originalPluginEmit = pluginEventManager.emitAsync;
    const originalProxyEmit = proxyEventManager.emitAsync;
    const originalRun = Pipeline.run;

    const scope: any = {
      lifecycle: { isHijacked: false },
      request: { client: {} },
    };

    let proxyEventCalled = false;
    let pipelineCalled = false;

    try {
      Pipeline.compile = (() => {}) as typeof Pipeline.compile;

      ScopeMutator.applyHttpsDecryptedState = (() => true) as any;

      pluginEventManager.emitAsync = (async (event: any) => {
        assert.equal(event, "proxy:client-https-request");
        scope.lifecycle.isHijacked = true;
      }) as typeof pluginEventManager.emitAsync;

      proxyEventManager.emitAsync = (async (event: any) => {
        if (event === "https:request") {
          proxyEventCalled = true;
        }
      }) as typeof proxyEventManager.emitAsync;

      Pipeline.run = (async () => {
        pipelineCalled = true;
      }) as typeof Pipeline.run;

      Middleware.register({ initializePipelines: true });

      await connectionEvents.emitAsync("HTTPS:DECRYPTED", { scope });

      assert.equal(scope.lifecycle.isHijacked, true);
      assert.equal(proxyEventCalled, false);
      assert.equal(pipelineCalled, false);
    } finally {
      Pipeline.compile = originalCompile;
      ScopeMutator.applyHttpsDecryptedState = originalApply;
      pluginEventManager.emitAsync = originalPluginEmit;
      proxyEventManager.emitAsync = originalProxyEmit;
      Pipeline.run = originalRun;
    }
  });

  it("should stop CONNECT processing when a plugin hijacks the request", async () => {
    const originalCompile = Pipeline.compile;
    const originalApply = ScopeMutator.applyConnectState;
    const originalPluginEmit = pluginEventManager.emitAsync;
    const originalProxyEmit = proxyEventManager.emitAsync;
    const originalRun = Pipeline.run;

    const scope: any = {
      lifecycle: { isHijacked: false },
      request: { client: {} },
    };

    let proxyEventCalled = false;
    let pipelineCalled = false;

    const socket: any = {
      destroyed: false,
      destroy() {
        this.destroyed = true;
      },
    };

    try {
      Pipeline.compile = (() => {}) as typeof Pipeline.compile;

      ScopeMutator.applyConnectState = (() => true) as any;

      pluginEventManager.emitAsync = (async (event: any) => {
        assert.equal(event, "proxy:client-connect");
        scope.lifecycle.isHijacked = true;
      }) as typeof pluginEventManager.emitAsync;

      proxyEventManager.emitAsync = (async (event: any) => {
        if (event === "connect:request") {
          proxyEventCalled = true;
        }
      }) as typeof proxyEventManager.emitAsync;

      Pipeline.run = (async () => {
        pipelineCalled = true;
      }) as typeof Pipeline.run;

      Middleware.register({ initializePipelines: true });

      await connectionEvents.emitAsync("CONNECT", {
        req: {} as any,
        socket,
        head: Buffer.alloc(0),
        scope,
      });

      assert.equal(scope.lifecycle.isHijacked, true);
      assert.equal(proxyEventCalled, false);
      assert.equal(pipelineCalled, false);
    } finally {
      Pipeline.compile = originalCompile;
      ScopeMutator.applyConnectState = originalApply;
      pluginEventManager.emitAsync = originalPluginEmit;
      proxyEventManager.emitAsync = originalProxyEmit;
      Pipeline.run = originalRun;
    }
  });
});
