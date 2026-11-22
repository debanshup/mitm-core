[mitm-core](../globals.md) / AbortMessage

# Type Alias: AbortMessage

> **AbortMessage** = `object`

Defined in: [src/core/signals/types.ts:13](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/signals/types.ts#L13)

Describes the context associated with an intentional pipeline abort.

Provides a human-readable reason, the plugin responsible for the abort,
and the event being processed when the abort was requested.

## Properties

### cause?

> `optional` **cause?**: `unknown`

Defined in: [src/core/signals/types.ts:31](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/signals/types.ts#L31)

Captured error context or lower-level exception metadata.

***

### event?

> `optional` **event?**: keyof [`ProxyEventMap`](../interfaces/ProxyEventMap.md) \| `string`

Defined in: [src/core/signals/types.ts:28](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/signals/types.ts#L28)

Event associated with the pipeline abort.

***

### message

> **message**: `string`

Defined in: [src/core/signals/types.ts:15](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/signals/types.ts#L15)

Human-readable explanation for stopping pipeline execution.

***

### plugin?

> `optional` **plugin?**: [`BasePlugin`](../classes/BasePlugin.md)\<`any`\>

Defined in: [src/core/signals/types.ts:23](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/signals/types.ts#L23)

Plugin associated with the abort request.

***

### reason?

> `optional` **reason?**: [`AbortReason`](AbortReason.md)

Defined in: [src/core/signals/types.ts:18](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/signals/types.ts#L18)

Category of the abort request.
