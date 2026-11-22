[mitm-core](../globals.md) / RequestContext

# Type Alias: RequestContext

> **RequestContext** = `object`

Defined in: [src/core/scope/types.ts:94](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L94)

Contains the data associated with an individual request-response
transaction passing through the proxy.

Separates client-facing request data, upstream request data, and
the target information used for routing. WebSocket-specific metadata
is available when the transaction involves an upgrade.

## Properties

### client

> **client**: `object`

Defined in: [src/core/scope/types.ts:99](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L99)

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

### explicitHeaderOverrides?

> `optional` **explicitHeaderOverrides?**: `ExplicitHeaderOverrides`

Defined in: [src/core/scope/types.ts:153](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L153)

Optional per-request header customization rules.

Overrides global header settings for this transaction.

***

### requestId

> **requestId**: `string`

Defined in: [src/core/scope/types.ts:96](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L96)

Unique identifier assigned to this request-response transaction.

***

### target

> **target**: `object`

Defined in: [src/core/scope/types.ts:126](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L126)

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

Defined in: [src/core/scope/types.ts:117](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L117)

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

Defined in: [src/core/scope/types.ts:146](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L146)

WebSocket-specific state and endpoint references.

Present for WebSocket-related transactions when the proxy populates
this field; otherwise, it is undefined.
