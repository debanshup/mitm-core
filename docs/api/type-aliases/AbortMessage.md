[mitm-core](../globals.md) / AbortMessage

# Type Alias: AbortMessage

> **AbortMessage** = `object`

Defined in: [src/core/signals/types.ts:10](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/signals/types.ts#L10)

Describes the context associated with an intentional pipeline abort.

Provides a human-readable reason, the plugin responsible for the abort,
and the event being processed when the abort was requested.

## Properties

### event

> **event**: keyof [`ProxyEventMap`](../interfaces/ProxyEventMap.md) \| `string`

Defined in: [src/core/signals/types.ts:18](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/signals/types.ts#L18)

Event associated with the pipeline abort.

***

### message

> **message**: `string`

Defined in: [src/core/signals/types.ts:12](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/signals/types.ts#L12)

Human-readable explanation for stopping pipeline execution.

***

### plugin

> **plugin**: [`BasePlugin`](../classes/BasePlugin.md)\<`any`\>

Defined in: [src/core/signals/types.ts:15](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/signals/types.ts#L15)

Plugin associated with the abort request.
