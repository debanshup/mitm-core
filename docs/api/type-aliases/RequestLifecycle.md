[mitm-core](../globals.md) / RequestLifecycle

# Type Alias: RequestLifecycle

> **RequestLifecycle** = `object`

Defined in: [src/core/scope/types.ts:161](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L161)

Tracks request lifecycle metadata and controls request-pipeline execution.

Includes the hijack flag, timing information, and internal pipeline
execution state.

## Properties

### isHijacked

> **isHijacked**: `boolean`

Defined in: [src/core/scope/types.ts:170](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L170)

Indicates whether the request has been taken over by a handler
and should no longer follow the normal pipeline path.

#### Remarks

The effect of this flag depends on how the pipeline and handlers
interpret it.

***

### timestamps

> **timestamps**: `object`

Defined in: [src/core/scope/types.ts:173](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L173)

Timing measurements collected during request processing.

#### duration?

> `optional` **duration?**: `number`

Total request duration, when calculated.

#### receivedAt

> **receivedAt**: `number`

Timestamp recorded when the request is received.

#### respondedAt?

> `optional` **respondedAt?**: `number`

Timestamp recorded when the response is completed, if available.

#### upstreamReceivedAt?

> `optional` **upstreamReceivedAt?**: `number`

Timestamp recorded when the upstream response is received, if available.

#### upstreamSentAt?

> `optional` **upstreamSentAt?**: `number`

Timestamp recorded when the request is sent upstream, if available.
