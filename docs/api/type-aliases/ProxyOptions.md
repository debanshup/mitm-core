[mitm-core](../globals.md) / ProxyOptions

# Type Alias: ProxyOptions

> **ProxyOptions** = [`ProxyConfig`](ProxyConfig.md) & `object`

Defined in: [src/config.registry.ts:81](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/config.registry.ts#L81)

Configuration options for creating a Proxy instance.

Extends the proxy configuration with an optional existing HTTP server
to which the proxy can attach.

## Type Declaration

### server?

> `optional` **server?**: `http.Server`

An existing HTTP server to attach the proxy to.

If omitted, the proxy creates a new HTTP server.
