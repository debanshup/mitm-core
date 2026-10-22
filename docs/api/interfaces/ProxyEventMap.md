[mitm-core](../globals.md) / ProxyEventMap

# Interface: ProxyEventMap

Defined in: [src/core/event/proxy-events/proxyEvents.ts:13](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L13)

Defines the events emitted by the proxy throughout its connection
and request lifecycle.

Each event maps to a tuple describing its emitted arguments. Events
that carry structured data use a single payload object.

## Properties

### connect:before

> **connect:before**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:45](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L45)

Fired after the request scope and proxy context have been initialized,
immediately before the client and upstream streams are connected.

Use this event to inspect or prepare the tunnel before data forwarding
begins.

***

### connect:established

> **connect:established**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:51](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L51)

Fired when the secure tunnel has been established and the proxy
is ready to forward data between the client and upstream destination.

***

### connect:request

> **connect:request**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:30](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L30)

Fired when the proxy receives an HTTP CONNECT request to establish
a tunnel to an upstream destination, commonly for HTTPS or WSS traffic.

Provides the request scope, client socket, and any initial data
received alongside the CONNECT request.

***

### connection:open

> **connection:open**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:21](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L21)

Fired when a client establishes a raw TCP connection to the proxy.

Occurs at the transport layer, before HTTP request parsing.

***

### error

> **error**: \[`err`: `unknown`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:87](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L87)

Fired when an error is reported through the proxy's error event.

The error may originate from the proxy's network stack or plugin
execution.

***

### http:request

> **http:request**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:62](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L62)

Fired when the proxy receives a standard, unencrypted HTTP request.

This event does not handle intercepted HTTPS requests. Use
["https:request"](#httpsrequest) for requests received after HTTPS interception
and decryption.

***

### https:request

> **https:request**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:75](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L75)

Fired when an HTTPS request has been intercepted and decrypted
by the proxy.

The request scope provides access to the request data and target
metadata available for inspection or modification.

***

### ws:client-message

> **ws:client-message**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:114](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L114)

Fired when a client-originated WebSocket message is received,
before the bridge forwards it upstream.

***

### ws:close

> **ws:close**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:137](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L137)

Fired when a WebSocket endpoint reports a close event.

***

### ws:error

> **ws:error**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:149](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L149)

Fired when a WebSocket endpoint reports an error.

***

### ws:established

> **ws:established**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:108](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L108)

Fired after the upstream WebSocket upgrade succeeds and the proxy
finishes initializing the WebSocket tunnel.

***

### ws:request

> **ws:request**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:96](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L96)

Fired when the proxy receives a client WebSocket upgrade request.

This event does not guarantee that the upstream handshake succeeds.

***

### ws:upstream-message

> **ws:upstream-message**: \[`payload`: `object`\]

Defined in: [src/core/event/proxy-events/proxyEvents.ts:126](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/proxy-events/proxyEvents.ts#L126)

Fired when an upstream-originated WebSocket message is received,
before the bridge forwards it to the client.
