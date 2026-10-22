# Plugins

Plugins extend `mitm-core` by handling specific proxy lifecycle events. Each plugin declares the event it handles and implements a `run()` method that receives the corresponding event payload.

Plugins can also define optional initialization and cleanup hooks to manage resources.

## Creating a Plugin

Extend `BasePlugin` and specify the event name as its generic parameter.

```ts
import { BasePlugin, type PluginPayload } from "mitm-core";

export class RequestPlugin extends BasePlugin<"proxy:client-http-request"> {
  readonly event = "proxy:client-http-request" as const;

  async run(payload: PluginPayload<typeof this.event>): Promise<void> {
    const { scope } = payload;

    console.log("HTTP request received", scope.request);
  }
}
```

The selected event determines the payload type. TypeScript can therefore provide event-specific type checking and autocomplete.

Every plugin must implement `event` and `run()`. The `init()`, `cleanup()`, and `name` members are optional or inherited.

## Registering a Plugin

Register plugins with `proxy.use()` before starting the proxy.

```ts
import { Proxy } from "mitm-core";
import { RequestPlugin } from "./RequestPlugin";

const proxy = new Proxy();

proxy.use(new RequestPlugin());

await proxy.listen(8001);
```

You can chain registrations:

```ts
proxy.use(new RequestPlugin()).use(new AnotherPlugin());
```

Registering the same plugin instance more than once has no effect.

Plugins must be registered before the proxy starts. Calling `use()` while the proxy is starting, running, or stopped throws an error.

## Removing a Plugin

Use `unuse()` to unregister a plugin before the proxy starts:

```ts
const plugin = new RequestPlugin();

proxy.use(plugin);
proxy.unuse(plugin);
```

If the plugin is not registered, `unuse()` does nothing. Plugins cannot be unregistered after startup.

## Plugin Lifecycle

### `init()`

The proxy invokes `init()` during startup before the server begins listening.

Use it to prepare resources needed by the plugin, such as connections, caches, or internal state.

```ts
async init(): Promise<void> {
  // Prepare plugin resources.
}
```

The hook may be synchronous or asynchronous. If initialization fails, proxy startup fails and the proxy attempts to clean up plugins that initialized successfully.

### `run(payload)`

The proxy calls `run()` when the plugin's registered event is emitted.

```ts
async run(payload: PluginPayload<typeof this.event>): Promise<void> {
  const { scope } = payload;

  // Handle the event.
}
```

The handler can be synchronous or asynchronous. If multiple plugins listen for the same event, the proxy runs their handlers sequentially and waits for each handler to finish before running the next.

If a handler throws an error or its promise rejects, the error propagates through event execution. `PipelineAbortSignal` is handled separately from ordinary errors and is intended for observation and telemetry. **It does not stop pipeline execution.**

#### Using `PipelineAbortSignal`

Use `PipelineAbortSignal` when you need to report an intentional event or condition for observation or telemetry.

**Example: Provide a message**

```ts
throw new PipelineAbortSignal("Request blocked by policy");
```

**Example: Include plugin and event details**

```ts
throw new PipelineAbortSignal({
  message: "Request blocked by plugin",
  plugin,
  event: "http:request",
});
```

The signal provides context about what happened. It does not abort the default pipeline or prevent subsequent processing.

### `cleanup()`

The proxy invokes `cleanup()` during shutdown for plugins that initialized successfully.

```ts
async cleanup(): Promise<void> {
  // Release resources owned by the plugin.
}
```

Use this hook to close connections, clear timers, or flush buffered data.

Cleanup runs in reverse initialization order. Cleanup errors are logged, and the shutdown promise can reject if cleanup operations fail.

### Plugin Name

By default, `plugin.name` returns the runtime class name of the plugin. This is useful for logging and debugging.

## Plugin Events

Each plugin handles one event, selected through its `event` property. The currently defined plugin events are grouped below by their role in request processing.

| Event                           | When it fires                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `proxy:client-connect`          | When the proxy receives a client HTTP CONNECT request.                                                  |
| `proxy:client-before-handshake` | Immediately before the successful CONNECT response is written to the client.                            |
| `proxy:client-after-handshake`  | After the successful CONNECT response is written, before TLS interception setup has completed.          |
| `proxy:client-http-request`     | After plain HTTP request state is initialized and before pipeline execution begins.                     |
| `proxy:client-https-request`    | After decrypted HTTPS request state is initialized and before pipeline execution begins.                |
| `proxy:client-upgrade`          | When the upstream responds to an HTTP upgrade; the WebSocket tunnel might not yet be fully established. |
| `proxy:upstream-dispatch`       | After upstream request initialization and before pipeline processing continues.                         |
| `proxy:upstream-connect`        | When the upstream socket connects. For HTTPS, this milestone corresponds to `secureConnect`.            |
| `proxy:upstream-request`        | When the upstream request finishes writing its data; this does not mean a response has arrived.         |
| `proxy:target-response`         | After upstream response state is applied to the request scope.                                          |
| `proxy:target-error`            | When the HTTP/1 outbound error-handling path reports an error.                                          |
| `proxy:ws-client-message`       | Before a client-originated WebSocket message is forwarded.                                              |
| `proxy:ws-upstream-message`     | Before an upstream-originated WebSocket message is forwarded.                                           |

See [Proxy Events](./proxy-events.md) for more detail.

## Working with the Request Scope

Most plugin events provide a payload containing `scope`, a `RequestScope` object.

```ts
async run(payload: PluginPayload<typeof this.event>): Promise<void> {
  const { scope } = payload;

  // Inspect the scope fields relevant to your event.
  console.log(scope.request);
  console.log(scope.session);
}
```

The scope provides access to request and session context, along with lifecycle information. The fields available and their state depend on which event is being handled.

Consult the API reference for the exported `RequestScope`, `RequestContext`, `SessionContext`, and `RequestLifecycle` types.

## Intercepting WebSocket Messages

The WebSocket message events provide both `scope` and `messageContext`.

`messageContext` has this shape:

```ts
interface WsMessageContext {
  data: Buffer;
  isBinary: boolean;
  drop: boolean;
}
```

- `data` contains the message payload as a `Buffer`.
- `isBinary` indicates whether the message is binary.
- `drop` controls whether the message should be forwarded.

For example, a plugin can drop a client-originated message:

```ts
import { BasePlugin, type PluginPayload } from "mitm-core";

export class WebSocketFilter extends BasePlugin<"proxy:ws-client-message"> {
  readonly event = "proxy:ws-client-message" as const;

  run(payload: PluginPayload<typeof this.event>): void {
    const { messageContext } = payload;

    if (messageContext.data.toString("utf8").includes("blocked")) {
      messageContext.drop = true;
    }
  }
}
```

Setting `messageContext.drop` to `true` prevents the message from being forwarded. Message modifications should be made through the provided context.

Register the plugin before starting the proxy:

```ts
proxy.use(new WebSocketFilter());
```

## Plugin Execution Timeout

Plugin event listeners have a configurable execution timeout. The default is `10,000` milliseconds.

```ts
const proxy = new Proxy({
  pluginTimeoutMs: 5_000,
});
```

Each listener is awaited sequentially and, when the timeout is enabled, raced against its own timeout.

If a listener exceeds the configured timeout, event execution fails with a timeout error. **This does not automatically cancel the plugin's underlying asynchronous work.** A timed-out plugin may continue running if its implementation does not provide its own cancellation mechanism.

Setting `pluginTimeoutMs` to `0` disables the timeout.

See [Configuration](./configuration.md#timeout-configuration) for details.

## Best Practices

- Register plugins before calling `listen()`.
- Keep event handlers focused and avoid unnecessary blocking work.
- Use `init()` and `cleanup()` to manage plugin-owned resources.
- Handle errors from asynchronous plugin operations.
- Treat `scope` as event-specific context; not every field is necessarily populated at every event.
- For WebSocket filtering, modify the supplied `messageContext` and set `drop` when a message should not be forwarded.
- Do not assume that a plugin timeout automatically cancels ongoing asynchronous work.

## Related Guides

- [Getting Started](./getting-started.md)
- [Configuration](./configuration.md)
- [Proxy Events](./proxy-events.md)
- [Rules](./rules.md)
- [Troubleshooting](./troubleshooting.md)
