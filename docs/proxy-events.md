# Proxy Events

`mitm-core` exposes a typed event API for observing the proxy's connection, HTTP, HTTPS, CONNECT tunnel, and WebSocket lifecycles.

Proxy events are useful for:

- Logging connections and requests.
- Collecting request and WebSocket telemetry.
- Observing CONNECT tunnel establishment.
- Tracking WebSocket messages and connection closure.
- Reporting proxy errors.
- Integrating monitoring or debugging tools with the proxy lifecycle.

Proxy events are observational lifecycle hooks. Use the [plugin system](./plugins.md) when you need to participate in plugin-defined processing or modify behavior at a supported pipeline stage.

## Table of Contents

- [Accessing the Event API](#accessing-the-event-api)
- [Registering Listeners](#registering-listeners)
- [Event Reference](#event-reference)
  - [Connection Events](#connection-events)
  - [CONNECT Tunnel Events](#connect-tunnel-events)
  - [HTTP and HTTPS Events](#http-and-https-events)
  - [Error Events](#error-events)
  - [WebSocket Events](#websocket-events)
- [Event Lifecycle](#event-lifecycle)
- [Asynchronous Listeners](#asynchronous-listeners)
- [Error Handling](#error-handling)
- [Proxy and Plugin Events](#proxy-and-plugin-events)
- [Listener Cleanup](#listener-cleanup)
- [Complete Example](#complete-example)

## Accessing the Event API

Register listeners on a `Proxy` instance using its event methods.

```ts
import { Proxy } from "mitm-core";

const proxy = new Proxy({
  // Your proxy configuration
});

proxy.on("http:request", ({ scope }) => {
  console.log("HTTP request received", scope);
});
```

The constructor options above are illustrative. See [Configuration](./configuration.md) and [Getting Started](./getting-started.md) for the configuration supported by your installed version.

The `Proxy` class exposes the following event-related methods:

| Method                            | Description                                         |
| --------------------------------- | --------------------------------------------------- |
| `on(event, listener)`             | Register a listener.                                |
| `once(event, listener)`           | Register a listener that runs once.                 |
| `off(event, listener)`            | Remove a specific listener.                         |
| `addListener(event, listener)`    | Alias for `on()`.                                   |
| `removeListener(event, listener)` | Alias for `off()`.                                  |
| `removeAllListeners(event?)`      | Remove listeners for one event or all proxy events. |
| `listeners(event)`                | Retrieve the listeners registered for an event.     |

Event names and listener argument types are defined by `ProxyEventMap`, providing TypeScript autocomplete and type checking.

## Registering Listeners

### Basic listener

Most proxy events provide one structured payload object.

```ts
proxy.on("http:request", ({ scope }) => {
  console.log("HTTP request observed");
  console.log(scope);
});
```

### Register a one-time listener

Use `once()` when you only need to observe the first occurrence.

```ts
proxy.once("connect:established", ({ scope }) => {
  console.log("A CONNECT tunnel was established", scope);
});
```

### Remove a listener

Keep a reference to the listener when you need to unregister it later.

```ts
const onRequest = ({ scope }: { scope: RequestScope }) => {
  console.log("Request observed", scope);
};

proxy.on("http:request", onRequest);

// Later:
proxy.off("http:request", onRequest);
```

Import `RequestScope` from the package's public type exports if your installed version exposes it there. Otherwise, use the corresponding type-export path documented by your version.

**Important:** The `error` event is different from the structured-payload events. Its listener receives the error directly:

```ts
proxy.on("error", (error) => {
  console.error("Proxy error:", error);
});
```

Do not expect an `{ error }` wrapper for this event.

## Event Reference

The following sections describe the supported proxy events, their payloads, and when they are emitted.

### Connection Events

#### `connection:open`

Emitted when a client establishes a raw TCP connection to the proxy.

**Payload**

```ts
{
  socket: Socket;
}
```

- `socket`: The underlying Node.js TCP socket.

This event occurs at the transport layer, before HTTP request parsing.

**Example**

```ts
proxy.on("connection:open", ({ socket }) => {
  console.log("Client TCP connection opened");
  console.log("Remote address:", socket.remoteAddress);
  console.log("Remote port:", socket.remotePort);
});
```

Use this event to count incoming TCP connections or collect transport-level connection metadata.

A TCP connection does not necessarily represent a completed HTTP request or a successfully established CONNECT tunnel.

### CONNECT Tunnel Events

CONNECT is commonly used by clients to establish a tunnel for HTTPS traffic. The CONNECT request itself is not the same as a successfully established tunnel.

#### `connect:request`

Emitted when the proxy receives a client CONNECT request and prepares its request scope.

**Payload**

```ts
{
  scope: RequestScope;
  socket: Stream.Duplex;
  head: Buffer;
}
```

- `scope`: The request's `RequestScope`.
- `socket`: The client-side duplex stream.
- `head`: Any initial data received alongside the CONNECT request.

**Example**

```ts
proxy.on("connect:request", ({ scope, socket, head }) => {
  console.log("CONNECT request received");
  console.log("Initial buffered data:", head.length);
});
```

This event indicates that a CONNECT request was received. It does not guarantee that the tunnel will be established.

#### `connect:before`

Emitted after the request scope and proxy context have been initialized, immediately before the client and upstream streams are connected.

**Payload**

```ts
{
  scope: RequestScope;
  socket: Stream.Duplex;
}
```

**Example**

```ts
proxy.on("connect:before", ({ scope }) => {
  console.log("CONNECT tunnel is about to be connected");
});
```

Use this event to observe the tunnel setup stage.

#### `connect:established`

Emitted when the secure tunnel has been established and the proxy is ready to forward data between the client and upstream destination.

**Payload**

```ts
{
  scope: RequestScope;
  socket: Stream.Duplex;
}
```

**Example**

```ts
proxy.on("connect:established", ({ scope }) => {
  console.log("CONNECT tunnel established", scope);
});
```

A successfully established CONNECT tunnel does not necessarily mean that every subsequent request will succeed.

For intercepted HTTPS traffic, decrypted requests are reported separately through `https:request`.

### HTTP and HTTPS Events

#### `http:request`

Emitted when the proxy receives a standard, unencrypted HTTP request.

**Payload**

```ts
{
  scope: RequestScope;
}
```

**Example**

```ts
proxy.on("http:request", ({ scope }) => {
  console.log("HTTP request observed", scope);
});
```

Use this event to observe ordinary HTTP requests handled by the proxy.

This event is distinct from `https:request`.

#### `https:request`

Emitted when an HTTPS request has been intercepted and decrypted by the proxy.

**Payload**

```ts
{
  scope: RequestScope;
}
```

**Example**

```ts
proxy.on("https:request", ({ scope }) => {
  console.log("Decrypted HTTPS request observed", scope);
});
```

The `scope` provides access to the request data and target metadata available at this stage.

Use this event to observe HTTPS requests that have reached the decrypted HTTP request-processing path.

**Note:** `https:request` does not mean that every request will receive a successful upstream response. It indicates that the request reached the interception and decryption stage.

### Error Events

#### `error`

Emitted when the proxy reports an error through its proxy error-reporting mechanism.

**Listener argument**

```ts
error: unknown;
```

Unlike the other events, the error is passed directly to the listener rather than wrapped in a payload object.

**Example**

```ts
proxy.on("error", (error) => {
  if (error instanceof Error) {
    console.error("Proxy error:", error.message);
    console.error(error.stack);
  } else {
    console.error("Proxy error:", error);
  }
});
```

The error may be an `Error` instance or another value, so avoid assuming that every emitted value has `message` or `stack` properties.

**Important behavior:** The current implementation reports errors through `reportProxyError()`. It emits the `error` event only when at least one listener is registered. If no listener is registered, it does not automatically log the error through this reporting helper.

Register an error listener if you want to receive reported proxy errors.

The `error` event is not a guarantee that every internal failure will be emitted: some expected connection closures and component-specific failures may be handled separately.

### WebSocket Events

WebSocket events cover the upgrade request, successful establishment, message forwarding, closure, and endpoint errors.

#### `ws:request`

Emitted when the proxy receives a client WebSocket upgrade request.

**Payload**

```ts
{
  scope: RequestScope;
  socket: Stream.Duplex;
  head: Buffer;
}
```

- `scope`: The WebSocket request's `RequestScope`.
- `socket`: The client-side duplex stream.
- `head`: Any initial data received alongside the upgrade request.

**Example**

```ts
proxy.on("ws:request", ({ scope, socket, head }) => {
  console.log("WebSocket upgrade request received");
  console.log("Initial buffered data:", head.length);
});
```

This event is emitted before the upstream WebSocket handshake has been confirmed. The request may still fail to establish a WebSocket connection.

#### `ws:established`

Emitted after the upstream WebSocket upgrade succeeds and the proxy finishes initializing the WebSocket tunnel.

**Payload**

```ts
{
  scope: RequestScope;
}
```

**Example**

```ts
proxy.on("ws:established", ({ scope }) => {
  console.log("WebSocket tunnel established", scope);
});
```

Use this event to track successfully initialized WebSocket tunnels.

#### `ws:client-message`

Emitted when a client-originated WebSocket message passes the bridge's message-processing checks and the bridge calls `send()` on the upstream WebSocket.

**Payload**

```ts
{
  scope: RequestScope;
  data: Buffer;
  isBinary: boolean;
}
```

- `scope`: The WebSocket request's `RequestScope`.
- `data`: The original client message data as a `Buffer`.
- `isBinary`: Whether the original message was binary.

**Example**

```ts
proxy.on("ws:client-message", ({ data, isBinary }) => {
  console.log("Client WebSocket message");
  console.log("Bytes:", data.length);
  console.log("Binary:", isBinary);
});
```

The event is emitted after the bridge calls the upstream WebSocket's `send()` method. This does not guarantee that the upstream application received or processed the message.

The payload contains the original received message data. If plugin processing transforms the forwarded message, `data` should not be assumed to represent the transformed payload.

Messages dropped by the bridge's message-processing path do not reach this emission site.

#### `ws:upstream-message`

Emitted when an upstream-originated WebSocket message passes the bridge's message-processing checks and the bridge calls `send()` on the client WebSocket.

**Payload**

```ts
{
  scope: RequestScope;
  data: Buffer;
  isBinary: boolean;
}
```

**Example**

```ts
proxy.on("ws:upstream-message", ({ data, isBinary }) => {
  console.log("Upstream WebSocket message");
  console.log("Bytes:", data.length);
  console.log("Binary:", isBinary);
});
```

As with `ws:client-message`, the payload contains the original received message data. The event is emitted after the bridge calls the destination's `send()` method, not after confirming delivery to the other endpoint.

#### `ws:close`

Emitted when either WebSocket endpoint reports that it has closed.

**Payload**

```ts
{
  scope: RequestScope;
  direction: "client" | "upstream";
  code: number;
  reason: Buffer;
}
```

- `scope`: The WebSocket request's `RequestScope`.
- `direction`: Which endpoint reported the close: `"client"` or `"upstream"`.
- `code`: The WebSocket close code.
- `reason`: The close reason as a `Buffer`.

**Example**

```ts
proxy.on("ws:close", ({ direction, code, reason }) => {
  console.log("WebSocket endpoint closed");
  console.log("Direction:", direction);
  console.log("Code:", code);
  console.log("Reason:", reason.toString("utf8"));
});
```

A close event identifies which endpoint reported the close. It should not be interpreted as proof that both endpoints closed simultaneously or that the connection closed normally.

#### `ws:error`

Emitted when a WebSocket endpoint reports an error.

**Payload**

```ts
{
  scope: RequestScope;
  direction: "client" | "upstream";
  error: Error;
}
```

- `scope`: The WebSocket request's `RequestScope`.
- `direction`: The endpoint reporting the error.
- `error`: The WebSocket endpoint's error.

**Example**

```ts
proxy.on("ws:error", ({ direction, error }) => {
  console.error(`WebSocket ${direction} endpoint error:`, error);
});
```

The `direction` field helps distinguish errors from the client-facing WebSocket endpoint from errors reported by the upstream endpoint.

The bridge performs its own tunnel teardown handling after endpoint errors. Listening to this event is for observation and diagnostics; it is not a replacement for the bridge's internal cleanup behavior.

## Event Lifecycle

The following diagram summarizes the major event stages. It is a conceptual overview rather than a guarantee that every connection follows one linear path.

<img
  src="https://raw.githubusercontent.com/debanshup/mitm-core-asset/54076fcea22b5b1fa7a5cae36706af8aa1b7967f/proxy-event-lifecycle.svg"
  alt="Proxy Event Lifecycle"
  style="width: 100%; max-width: 750px; height: auto;"
/>

### Lifecycle considerations

- `connection:open` is a transport-level event; it does not imply that a request has been parsed.
- `connect:request` and `ws:request` indicate incoming requests, not successful tunnels.
- `connect:established` and `ws:established` indicate later, successful setup stages.
- `http:request` and `https:request` represent different request-processing paths.
- WebSocket close and error events can originate from either endpoint.
- Error reporting is separate from normal lifecycle events.

## Asynchronous Listeners

The event system supports listeners that return either `void` or `Promise<void>`.

```ts
proxy.on("http:request", async ({ scope }) => {
  await recordRequest(scope);
});
```

The current event-emission sites generally call `emitAsync()` and await its completion. For those sites, asynchronous listeners participate in the emission's completion path.

Keep listeners efficient: expensive logging, remote telemetry, or other slow asynchronous work can delay the emission path that awaits the listener.

### Listener failures

An asynchronous listener may reject. Depending on the emission site, that rejection can be caught by the surrounding component and reported through the proxy's error-reporting mechanism.

Do not assume that listener failures are always isolated from the component that emitted the event. If a listener performs fallible work, handle expected failures inside the listener.

```ts
proxy.on("http:request", async ({ scope }) => {
  try {
    await recordRequest(scope);
  } catch (error) {
    console.error("Unable to record request telemetry:", error);
  }
});
```

This example handles telemetry failures locally so that a logging or monitoring problem does not unnecessarily propagate through the event-emission path.

## Error Handling

Register the proxy's error listener early, preferably before starting the proxy.

```ts
proxy.on("error", (error) => {
  if (error instanceof Error) {
    console.error("[mitm-core]", error.message);
  } else {
    console.error("[mitm-core]", error);
  }
});
```

When implementing error reporting:

1. Accept `unknown` rather than assuming every value is an `Error`.
2. Avoid throwing from error listeners.
3. Handle failures in asynchronous telemetry code.
4. Do not treat expected socket closure as necessarily a proxy failure.
5. Do not assume the `error` event replaces component-specific cleanup or recovery behavior.

The proxy's error-reporting helper also protects against errors thrown synchronously by an error listener. It logs the listener failure and the original error in that situation. This safeguard does not mean that throwing from listeners is recommended.

## Proxy and Plugin Events

`mitm-core` has two distinct event systems.

| Event system  | Purpose                                                               | Examples                                          |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| Proxy events  | Observe connection, request, tunnel, WebSocket, and error lifecycles. | `http:request`, `connect:established`, `ws:close` |
| Plugin events | Participate in plugin-defined processing and extension points.        | `proxy:client-upgrade`, `proxy:upstream-dispatch` |

Proxy events are exposed through the `Proxy` event API and defined by `ProxyEventMap`.

Plugin events are handled by the plugin event manager and are associated with the plugin system. They are not automatically interchangeable with public proxy lifecycle events.

For example, use `ws:request` to observe an incoming WebSocket upgrade request. Use the appropriate plugin event and plugin interface when your goal is to participate in the proxy's WebSocket processing flow.

See [Plugins](./plugins.md) for plugin registration, event contracts, and supported extension points.

## Listener Cleanup

Remove listeners when they are no longer needed.

```ts
const onWsClose = ({
  direction,
  code,
}: {
  direction: "client" | "upstream";
  code: number;
}) => {
  console.log("WebSocket closed:", direction, code);
};

proxy.on("ws:close", onWsClose);

// When finished:
proxy.off("ws:close", onWsClose);
```

You can also remove every listener for one event:

```ts
proxy.removeAllListeners("ws:close");
```

Or remove all proxy-event listeners:

```ts
proxy.removeAllListeners();
```

**Lifecycle note:** In the current implementation, proxy instances delegate event registration to a shared `proxyEventManager`. The `Proxy.stop()` cleanup path removes all listeners from that manager, rather than only listeners associated with the particular instance. If you create multiple proxy instances in the same process, account for this shared-listener behavior when designing your lifecycle and cleanup strategy.

## Complete Example

The following example demonstrates a basic event-monitoring setup. It assumes that `proxy` has already been configured.

```ts
import { Proxy } from "mitm-core";

const proxy = new Proxy({
  // Your proxy configuration
});

// Report proxy errors.
proxy.on("error", (error) => {
  console.error("[proxy:error]", error);
});

// Observe TCP connections.
proxy.on("connection:open", ({ socket }) => {
  console.log("[connection:open]", socket.remoteAddress);
});

// Observe HTTP requests.
proxy.on("http:request", ({ scope }) => {
  console.log("[http:request]", scope);
});

// Observe intercepted HTTPS requests.
proxy.on("https:request", ({ scope }) => {
  console.log("[https:request]", scope);
});

// Observe CONNECT tunnel establishment.
proxy.on("connect:established", ({ scope }) => {
  console.log("[connect:established]", scope);
});

// Observe WebSocket establishment.
proxy.on("ws:established", ({ scope }) => {
  console.log("[ws:established]", scope);
});

// Observe WebSocket traffic.
proxy.on("ws:client-message", ({ data, isBinary }) => {
  console.log("[ws:client-message]", {
    bytes: data.length,
    isBinary,
  });
});

proxy.on("ws:upstream-message", ({ data, isBinary }) => {
  console.log("[ws:upstream-message]", {
    bytes: data.length,
    isBinary,
  });
});

// Observe WebSocket lifecycle events.
proxy.on("ws:close", ({ direction, code, reason }) => {
  console.log("[ws:close]", {
    direction,
    code,
    reason: reason.toString("utf8"),
  });
});

proxy.on("ws:error", ({ direction, error }) => {
  console.error(`[ws:error:${direction}]`, error);
});

// Start the proxy using the startup API and configuration
// documented for your installed mitm-core version.
```

## Related Guides

- [Getting Started](./getting-started.md)
- [Configuration](./configuration.md)
- [Plugins](./plugins.md)
- [Rules](./rules.md)
- [Troubleshooting](./troubleshooting.md)
