[mitm-core](../globals.md) / ProxyOptions

# Type Alias: ProxyOptions

> **ProxyOptions** = [`ProxyConfig`](ProxyConfig.md) & `object`

Defined in: [src/config.registry.ts:109](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/config.registry.ts#L109)

Configuration options for creating a Proxy instance.

Extends the proxy configuration with an optional existing HTTP server
to which the proxy can attach.

## Type Declaration

### server?

> `optional` **server?**: `http.Server`

An existing HTTP server to attach the proxy to.

If omitted, the proxy creates a new HTTP server.
