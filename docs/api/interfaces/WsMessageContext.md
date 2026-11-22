[mitm-core](../globals.md) / WsMessageContext

# Interface: WsMessageContext

Defined in: [src/core/event/plugin-events/pluginEvents.ts:12](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/event/plugin-events/pluginEvents.ts#L12)

Context provided to plugins when intercepting a WebSocket message.

Allows a plugin to inspect or modify the message payload and decide
whether the message should be forwarded.

## Properties

### data

> **data**: `Buffer`

Defined in: [src/core/event/plugin-events/pluginEvents.ts:14](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/event/plugin-events/pluginEvents.ts#L14)

WebSocket message payload represented as a Buffer.

***

### drop

> **drop**: `boolean`

Defined in: [src/core/event/plugin-events/pluginEvents.ts:24](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/event/plugin-events/pluginEvents.ts#L24)

Indicates whether the message should be dropped instead of forwarded.

Set this to true to prevent forwarding the message.

***

### isBinary

> **isBinary**: `boolean`

Defined in: [src/core/event/plugin-events/pluginEvents.ts:17](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/event/plugin-events/pluginEvents.ts#L17)

Indicates whether the message is a binary message.
