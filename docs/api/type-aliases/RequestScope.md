[mitm-core](../globals.md) / RequestScope

# Type Alias: RequestScope

> **RequestScope** = `object`

Defined in: [src/core/scope/types.ts:308](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L308)

Root context for processing an individual proxy transaction.

Combines the connection-level context, request-level data, and
lifecycle information into a single object shared across the
proxy's execution pipeline.

## Properties

### lifecycle

> **lifecycle**: [`RequestLifecycle`](RequestLifecycle.md)

Defined in: [src/core/scope/types.ts:324](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L324)

Lifecycle metadata and pipeline execution controls for this transaction.

***

### request

> **request**: [`RequestContext`](RequestContext.md)

Defined in: [src/core/scope/types.ts:319](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L319)

Data associated with the current request-response transaction,
including client, upstream, and target information.

***

### session

> **session**: [`SessionContext`](SessionContext.md)

Defined in: [src/core/scope/types.ts:313](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L313)

Connection-level context shared across requests associated with
the same underlying connection.
