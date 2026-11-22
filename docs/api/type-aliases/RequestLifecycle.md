[mitm-core](../globals.md) / RequestLifecycle

# Type Alias: RequestLifecycle

> **RequestLifecycle** = `object`

Defined in: [src/core/scope/types.ts:244](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L244)

Tracks request lifecycle metadata and controls request-pipeline execution.

Includes the hijack flag, timing information, and internal pipeline
execution state.

## Properties

### abort?

> `optional` **abort?**: `PipelineAbortState`

Defined in: [src/core/scope/types.ts:290](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L290)

Metadata describing an intentional pipeline abort.

When present, the pipeline must not resume normal execution.

***

### failure?

> `optional` **failure?**: [`PipelineFailureState`](PipelineFailureState.md)

Defined in: [src/core/scope/types.ts:298](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L298)

Metadata describing a failure encountered during pipeline execution.

When present, it records the failure details and its impact on
the current request or underlying connection.

***

### isHijacked

> **isHijacked**: `boolean`

Defined in: [src/core/scope/types.ts:252](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L252)

Indicates whether the request has been taken over by a handler.

When set, the pipeline treats the request as hijacked and stops
normal processing. The handler that takes ownership becomes
responsible for managing the request or connection.

***

### nextPhase?

> `optional` **nextPhase?**: `Phase`

Defined in: [src/core/scope/types.ts:276](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L276)

Identifies the next pipeline phase to execute.

***

### timestamps

> **timestamps**: `object`

Defined in: [src/core/scope/types.ts:255](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L255)

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
