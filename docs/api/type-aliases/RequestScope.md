[mitm-core](../globals.md) / RequestScope

# Type Alias: RequestScope

> **RequestScope** = `object`

Defined in: [src/core/scope/types.ts:212](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/scope/types.ts#L212)

Root context for processing an individual proxy transaction.

Combines the connection-level context, request-level data, and
lifecycle information into a single object shared across the
proxy's execution pipeline.

## Properties

### lifecycle

> **lifecycle**: [`RequestLifecycle`](RequestLifecycle.md)

Defined in: [src/core/scope/types.ts:228](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/scope/types.ts#L228)

Lifecycle metadata and pipeline execution controls for this transaction.

***

### request

> **request**: [`RequestContext`](RequestContext.md)

Defined in: [src/core/scope/types.ts:223](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/scope/types.ts#L223)

Data associated with the current request-response transaction,
including client, upstream, and target information.

***

### session

> **session**: [`SessionContext`](SessionContext.md)

Defined in: [src/core/scope/types.ts:217](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/scope/types.ts#L217)

Connection-level context shared across requests associated with
the same underlying connection.
