[mitm-core](../globals.md) / PipelineFailureState

# Type Alias: PipelineFailureState

> **PipelineFailureState** = `object`

Defined in: [src/core/scope/types.ts:215](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L215)

Records details about a failure encountered during pipeline execution.

Includes the failure message, execution phase, timestamp,
impact scope, and optional error metadata.

## Properties

### cause?

> `optional` **cause?**: `unknown`

Defined in: [src/core/scope/types.ts:235](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L235)

Original error or additional context associated with the failure.

***

### code?

> `optional` **code?**: `string`

Defined in: [src/core/scope/types.ts:232](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L232)

Optional error code associated with the failure.

***

### disposition

> **disposition**: `FailureDisposition`

Defined in: [src/core/scope/types.ts:226](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L226)

Indicates whether the failure is recoverable or terminal.

***

### failedAt

> **failedAt**: `number`

Defined in: [src/core/scope/types.ts:223](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L223)

Timestamp when the failure was recorded.

***

### message

> **message**: `string`

Defined in: [src/core/scope/types.ts:217](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L217)

Human-readable description of the failure.

***

### phase

> **phase**: `Phase`

Defined in: [src/core/scope/types.ts:220](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L220)

Pipeline phase in which the failure occurred.

***

### scope

> **scope**: `FailureScope`

Defined in: [src/core/scope/types.ts:229](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L229)

Indicates whether the failure affects a request or the entire connection.
