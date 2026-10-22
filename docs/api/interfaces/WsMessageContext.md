[mitm-core](../globals.md) / WsMessageContext

# Interface: WsMessageContext

Defined in: [src/core/event/plugin-events/pluginEvents.ts:13](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L13)

Context provided to plugins when intercepting a WebSocket message.

Allows a plugin to inspect or modify the message payload and decide
whether the message should be forwarded.

## Properties

### data

> **data**: `Buffer`

Defined in: [src/core/event/plugin-events/pluginEvents.ts:15](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L15)

WebSocket message payload represented as a Buffer.

***

### drop

> **drop**: `boolean`

Defined in: [src/core/event/plugin-events/pluginEvents.ts:25](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L25)

Indicates whether the message should be dropped instead of forwarded.

Set this to true to prevent forwarding the message.

***

### isBinary

> **isBinary**: `boolean`

Defined in: [src/core/event/plugin-events/pluginEvents.ts:18](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/event/plugin-events/pluginEvents.ts#L18)

Indicates whether the message is a binary message.
