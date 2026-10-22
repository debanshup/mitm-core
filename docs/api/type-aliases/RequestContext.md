[mitm-core](../globals.md) / RequestContext

# Type Alias: RequestContext

> **RequestContext** = `object`

Defined in: [src/core/scope/types.ts:74](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L74)

Contains the data associated with an individual request-response
transaction passing through the proxy.

Separates client-facing request data, upstream request data, and
the target information used for routing. WebSocket-specific metadata
is available when the transaction involves an upgrade.

## Properties

### client

> **client**: `object`

Defined in: [src/core/scope/types.ts:79](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L79)

Client-facing HTTP request and response information.

#### headers?

> `optional` **headers?**: `IncomingHttpHeaders`

Headers associated with the client request.

#### method?

> `optional` **method?**: `string`

HTTP method of the client request, when available.

#### req?

> `optional` **req?**: `IncomingMessage`

Incoming request received from the client, when available.

#### res?

> `optional` **res?**: `ServerResponse`

Response object used to send data back to the client, when available.

#### url?

> `optional` **url?**: `string`

Request URL as received or represented by the proxy.

***

### requestId

> **requestId**: `string`

Defined in: [src/core/scope/types.ts:76](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L76)

Unique identifier assigned to this request-response transaction.

***

### target

> **target**: `object`

Defined in: [src/core/scope/types.ts:106](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L106)

Original and current destination information for routing.

#### host?

> `optional` **host?**: `string`

Current target host used by the proxy, when available.

#### originalHost?

> `optional` **originalHost?**: `string`

Original host extracted from the client request, when available.

#### originalUrl?

> `optional` **originalUrl?**: `string`

Original URL extracted from the client request, when available.

#### url?

> `optional` **url?**: `string`

Current target URL used by the proxy, when available.

***

### upstream

> **upstream**: `object`

Defined in: [src/core/scope/types.ts:97](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L97)

Upstream HTTP request and response information.

#### req?

> `optional` **req?**: `ClientRequest`

Outgoing request sent to the upstream server, when available.

#### res?

> `optional` **res?**: `IncomingMessage`

Response received from the upstream server, when available.

***

### webSocket?

> `optional` **webSocket?**: [`WebSocketContext`](WebSocketContext.md)

Defined in: [src/core/scope/types.ts:126](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L126)

WebSocket-specific state and endpoint references.

Present for WebSocket-related transactions when the proxy populates
this field; otherwise, it is undefined.
