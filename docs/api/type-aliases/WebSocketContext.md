[mitm-core](../globals.md) / WebSocketContext

# Type Alias: WebSocketContext

> **WebSocketContext** = `object`

Defined in: [src/core/scope/types.ts:162](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L162)

Contains WebSocket upgrade state and references to the client-side
and upstream WebSocket endpoints.

Raw upgrade socket information is also available when applicable.

## Properties

### client?

> `optional` **client?**: `NodeWebSocket`

Defined in: [src/core/scope/types.ts:170](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L170)

Client-side WebSocket endpoint, when available.

***

### isUpgraded

> **isUpgraded**: `boolean`

Defined in: [src/core/scope/types.ts:164](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L164)

Indicates whether the WebSocket connection has been upgraded.

***

### rawUpgradeSocket?

> `optional` **rawUpgradeSocket?**: `Duplex`

Defined in: [src/core/scope/types.ts:176](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L176)

Raw socket associated with the client-side upgrade, when available.

***

### subprotocol?

> `optional` **subprotocol?**: `string`

Defined in: [src/core/scope/types.ts:167](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L167)

Negotiated WebSocket subprotocol, when available.

***

### upgradeHead?

> `optional` **upgradeHead?**: `Buffer`

Defined in: [src/core/scope/types.ts:179](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L179)

Unconsumed bytes received alongside the HTTP upgrade request, when available.

***

### upstream?

> `optional` **upstream?**: `NodeWebSocket`

Defined in: [src/core/scope/types.ts:173](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L173)

Upstream WebSocket endpoint, when available.
