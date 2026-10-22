[mitm-core](../globals.md) / WebSocketContext

# Type Alias: WebSocketContext

> **WebSocketContext** = `object`

Defined in: [src/core/scope/types.ts:135](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/scope/types.ts#L135)

Contains WebSocket upgrade state and references to the client-side
and upstream WebSocket endpoints.

Raw upgrade socket information is also available when applicable.

## Properties

### client?

> `optional` **client?**: `NodeWebSocket`

Defined in: [src/core/scope/types.ts:143](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/scope/types.ts#L143)

Client-side WebSocket endpoint, when available.

***

### isUpgraded

> **isUpgraded**: `boolean`

Defined in: [src/core/scope/types.ts:137](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/scope/types.ts#L137)

Indicates whether the WebSocket connection has been upgraded.

***

### rawUpgradeSocket?

> `optional` **rawUpgradeSocket?**: `Duplex`

Defined in: [src/core/scope/types.ts:149](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/scope/types.ts#L149)

Raw socket associated with the client-side upgrade, when available.

***

### subprotocol?

> `optional` **subprotocol?**: `string`

Defined in: [src/core/scope/types.ts:140](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/scope/types.ts#L140)

Negotiated WebSocket subprotocol, when available.

***

### upgradeHead?

> `optional` **upgradeHead?**: `Buffer`

Defined in: [src/core/scope/types.ts:152](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/scope/types.ts#L152)

Unconsumed bytes received alongside the HTTP upgrade request, when available.

***

### upstream?

> `optional` **upstream?**: `NodeWebSocket`

Defined in: [src/core/scope/types.ts:146](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/scope/types.ts#L146)

Upstream WebSocket endpoint, when available.
