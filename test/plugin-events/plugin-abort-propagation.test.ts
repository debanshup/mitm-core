import { strict as assert } from "node:assert";
import { Proxy } from "../../src/lib/Proxy";
import { BasePlugin } from "../../src/core/plugin/BasePlugin";
import {
  pluginEventManager,
  type PluginEventMap,
} from "../../src/core/event/plugin-events/pluginEvents";
import { PipelineAbortSignal } from "../../src/core/signals/pipelineAbortSignal";
import type { RequestScope } from "../../src/core/scope/types";

const pluginEvents = [
  "proxy:client-connect",
  "proxy:client-before-handshake",
  "proxy:client-after-handshake",
  "proxy:client-http-request",
  "proxy:client-https-request",
  "proxy:client-upgrade",
  "proxy:upstream-dispatch",
  "proxy:upstream-connect",
  "proxy:upstream-request",
  "proxy:target-response",
  "proxy:target-error",
  "proxy:ws-client-message",
  "proxy:ws-upstream-message",
] as const satisfies readonly (keyof PluginEventMap)[];

class AbortTestPlugin extends BasePlugin<keyof PluginEventMap> {
  readonly event: keyof PluginEventMap;

  public invocations = 0;
  public abortSignal!: PipelineAbortSignal;

  constructor(event: keyof PluginEventMap) {
    super();
    this.event = event;
  }

  run(): void {
    this.invocations++;
    throw this.abortSignal;
  }
}

function createPayload(event: keyof PluginEventMap): any {
  const scope = {} as RequestScope;

  if (
    event === "proxy:ws-client-message" ||
    event === "proxy:ws-upstream-message"
  ) {
    return {
      scope,
      messageContext: {
        data: Buffer.from("test"),
        isBinary: false,
        drop: false,
      },
    };
  }

  return { scope };
}

describe("Plugin Abort Propagation", function () {
  let proxy: Proxy;
  let plugin: AbortTestPlugin;

  beforeEach(function () {
    proxy = new Proxy({
      useDefaultPipelines: false,
      pluginTimeoutMs: 10_000,
    });
  });

  afterEach(function () {
    if (plugin) {
      proxy.unuse(plugin);
    }
  });

  for (const event of pluginEvents) {
    it(`should propagate PipelineAbortSignal from ${event}`, async function () {
      plugin = new AbortTestPlugin(event);

      const signal = new PipelineAbortSignal({
        message: `Aborted by test plugin: ${event}`,
        reason: "plugin",
        event,
        plugin,
      });

      plugin.abortSignal = signal;

      // Register through the real public Proxy API.
      proxy.use(plugin);

      // Dispatch through the real PluginEventManager.
      await assert.rejects(
        pluginEventManager.emitAsync(event, createPayload(event)),
        (error: unknown) => {
          assert.strictEqual(error, signal);
          return true;
        },
      );

      assert.equal(plugin.invocations, 1);
    });
  }
});
