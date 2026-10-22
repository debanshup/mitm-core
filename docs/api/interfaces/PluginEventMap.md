[mitm-core](../globals.md) / PluginEventMap

# Interface: PluginEventMap

Defined in: [src/core/event/plugin-events/pluginEvents.ts:39](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L39)

Defines the events exposed by the proxy's plugin event system.

Events cover client-side connection and request processing, upstream
connection and request lifecycle, response handling, errors, and
WebSocket message interception.

Each event maps to a tuple describing the arguments passed to its
registered listeners. Event payloads provide access to the relevant
[RequestScope](../type-aliases/RequestScope.md) and, where applicable, message-specific context.

## Properties

### proxy:client-after-handshake

> **proxy:client-after-handshake**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:63](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L63)

Fired after the successful CONNECT response has been written,
but before TLS interception setup has completed.

***

### proxy:client-before-handshake

> **proxy:client-before-handshake**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:57](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L57)

Fired immediately before the proxy writes the successful CONNECT
response to the client.

Use this event to inspect the request scope before the handshake
response is written.

***

### proxy:client-connect

> **proxy:client-connect**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:48](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L48)

Fired when the proxy receives a client HTTP CONNECT request.

This represents the start of CONNECT request processing, not a
generic TCP connection event.

***

### proxy:client-http-request

> **proxy:client-http-request**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:69](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L69)

Fired after the plain HTTP request state has been initialized
and before pipeline execution begins.

***

### proxy:client-https-request

> **proxy:client-https-request**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:75](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L75)

Fired after the decrypted HTTPS request state has been initialized
and before pipeline execution begins.

***

### proxy:client-upgrade

> **proxy:client-upgrade**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:83](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L83)

Fired when the upstream responds to a request with an HTTP upgrade.

The WebSocket tunnel might not yet be fully established when this
event is emitted.

***

### proxy:target-error

> **proxy:target-error**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:119](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L119)

Fired when the HTTP/1 outbound error-handling path reports an error.

***

### proxy:target-response

> **proxy:target-response**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:114](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L114)

Fired after upstream response state has been applied to the request
scope.

***

### proxy:upstream-connect

> **proxy:upstream-connect**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:99](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L99)

Fired when the upstream socket connects.

For HTTPS connections, the corresponding connection milestone is
associated with the secureConnect event.

***

### proxy:upstream-dispatch

> **proxy:upstream-dispatch**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:91](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L91)

Fired after upstream request initialization and before the pipeline
continues processing the request.

***

### proxy:upstream-request

> **proxy:upstream-request**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:106](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L106)

Fired when the upstream request finishes writing its data.

This does not indicate that the upstream server has responded.

***

### proxy:ws-client-message

> **proxy:ws-client-message**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:127](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L127)

Fired before a client-originated WebSocket message is forwarded.

Plugins can inspect or modify the message through `messageContext`.
Set `messageContext.drop` to true to prevent forwarding it.

***

### proxy:ws-upstream-message

> **proxy:ws-upstream-message**: \[`payload`: `object`\]

Defined in: [src/core/event/plugin-events/pluginEvents.ts:137](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L137)

Fired before an upstream-originated WebSocket message is forwarded.

Plugins can inspect or modify the message through `messageContext`.
Set `messageContext.drop` to true to prevent forwarding it.
