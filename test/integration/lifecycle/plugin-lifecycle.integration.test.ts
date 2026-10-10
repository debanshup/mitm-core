import assert from "node:assert/strict";
import { Proxy } from "../../../src/lib/Proxy";
import { BasePlugin } from "../../../src/core/plugin/BasePlugin";

type TestEvent = "proxy:client-http-request";

class LifecyclePlugin extends BasePlugin<TestEvent> {
  readonly event = "proxy:client-http-request" as const;

  constructor(
    readonly pluginName: string,
    private readonly lifecycle: string[],
    private readonly initHook?: () => Promise<void> | void,
    private readonly cleanupHook?: () => Promise<void> | void,
  ) {
    super();
  }

  override get name(): string {
    return this.pluginName;
  }

  run(): void {}

  override async init(): Promise<void> {
    this.lifecycle.push(`init:${this.pluginName}`);
    await this.initHook?.();
  }

  override async cleanup(): Promise<void> {
    this.lifecycle.push(`cleanup:${this.pluginName}`);
    await this.cleanupHook?.();
  }
}

describe("Proxy plugin lifecycle", () => {
  it("initializes plugins sequentially before the startup callback", async () => {
    const proxy = new Proxy();
    const lifecycle: string[] = [];

    proxy
      .use(new LifecyclePlugin("A", lifecycle))
      .use(new LifecyclePlugin("B", lifecycle));

    try {
      await proxy.listen(0, () => {
        lifecycle.push("callback");
      });

      assert.deepEqual(lifecycle, ["init:A", "init:B", "callback"]);
    } finally {
      await proxy.stop();
    }

    assert.deepEqual(lifecycle, [
      "init:A",
      "init:B",
      "callback",
      "cleanup:B",
      "cleanup:A",
    ]);
  });

  it("cleans up initialized plugins in reverse order on shutdown", async () => {
    const proxy = new Proxy();
    const lifecycle: string[] = [];

    proxy.use(new LifecyclePlugin("A", lifecycle));
    proxy.use(new LifecyclePlugin("B", lifecycle));
    proxy.use(new LifecyclePlugin("C", lifecycle));

    await proxy.listen(0);

    await proxy.stop();

    assert.deepEqual(lifecycle, [
      "init:A",
      "init:B",
      "init:C",
      "cleanup:C",
      "cleanup:B",
      "cleanup:A",
    ]);
  });

  it("does not initialize the next plugin if an init hook fails", async () => {
    const proxy = new Proxy();
    const lifecycle: string[] = [];

    proxy.use(new LifecyclePlugin("A", lifecycle));
    proxy.use(
      new LifecyclePlugin("B", lifecycle, () => {
        throw new Error("init B failed");
      }),
    );
    proxy.use(new LifecyclePlugin("C", lifecycle));

    await assert.rejects(proxy.listen(0), /init B failed/);

    assert.deepEqual(lifecycle, ["init:A", "init:B", "cleanup:A"]);

    assert.equal(proxy.address(), null);

    await proxy.stop();
  });

  it("continues cleanup when one cleanup hook fails", async () => {
    const proxy = new Proxy();
    const lifecycle: string[] = [];

    proxy.use(new LifecyclePlugin("A", lifecycle));
    proxy.use(
      new LifecyclePlugin("B", lifecycle, undefined, () => {
        throw new Error("cleanup B failed");
      }),
    );
    proxy.use(new LifecyclePlugin("C", lifecycle));

    await proxy.listen(0);

    await assert.rejects(proxy.stop(), /cleanup operation.*failed/i);

    assert.deepEqual(lifecycle, [
      "init:A",
      "init:B",
      "init:C",
      "cleanup:C",
      "cleanup:B",
      "cleanup:A",
    ]);
  });

  it("cleans up initialized plugins if the startup callback fails", async () => {
    const proxy = new Proxy();
    const lifecycle: string[] = [];

    proxy.use(new LifecyclePlugin("A", lifecycle));
    proxy.use(new LifecyclePlugin("B", lifecycle));

    await assert.rejects(
      proxy.listen(0, () => {
        throw new Error("startup callback failed");
      }),
      /startup callback failed/,
    );

    assert.deepEqual(lifecycle, ["init:A", "init:B", "cleanup:B", "cleanup:A"]);

    assert.equal(proxy.address(), null);

    await proxy.stop();
  });

  it("cleans up previously initialized plugins when the port is occupied", async () => {
    const proxy = new Proxy();
    const occupiedProxy = new Proxy();
    const lifecycle: string[] = [];

    proxy.use(new LifecyclePlugin("A", lifecycle));

    await occupiedProxy.listen(0);
    const address = occupiedProxy.address();

    assert.ok(address && typeof address !== "string");

    try {
      await assert.rejects(
        proxy.listen(address.port),
        (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE",
      );

      assert.deepEqual(lifecycle, ["init:A", "cleanup:A"]);
    } finally {
      await proxy.stop();
      await occupiedProxy.stop();
    }
  });

  it("rejects plugin registration after startup", async () => {
    const proxy = new Proxy();
    const lifecycle: string[] = [];

    await proxy.listen(0);

    try {
      assert.throws(
        () => proxy.use(new LifecyclePlugin("A", lifecycle)),
        /before the proxy starts/i,
      );

      assert.throws(
        () => proxy.unuse(new LifecyclePlugin("B", lifecycle)),
        /cannot be unregistered after the proxy starts/i,
      );

      assert.deepEqual(lifecycle, []);
    } finally {
      await proxy.stop();
    }
  });

  it("cleans up a plugin that has cleanup but no init hook", async () => {
    const proxy = new Proxy();
    const lifecycle: string[] = [];

    class CleanupOnlyPlugin extends BasePlugin<"proxy:client-http-request"> {
      readonly event = "proxy:client-http-request" as const;

      run(): void {}

      override async cleanup(): Promise<void> {
        lifecycle.push("cleanup");
      }
    }

    proxy.use(new CleanupOnlyPlugin());

    await proxy.listen(0);
    await proxy.stop();

    assert.deepEqual(lifecycle, ["cleanup"]);
  });
});
