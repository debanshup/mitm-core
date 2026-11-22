[mitm-core](../globals.md) / GlobalHeaderOverrides

# Type Alias: GlobalHeaderOverrides

> **GlobalHeaderOverrides** = `object`

Defined in: [src/config.registry.ts:89](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/config.registry.ts#L89)

Defines HTTP header customization rules.

These rules are applied to all requests and responses handled by the proxy.
Per-request overrides take precedence over global overrides.

## Properties

### requestHeadersToRemove?

> `optional` **requestHeadersToRemove?**: `string`[]

Defined in: [src/config.registry.ts:97](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/config.registry.ts#L97)

Request headers to remove before forwarding requests upstream.

***

### requestOverrides?

> `optional` **requestOverrides?**: `Record`\<`string`, `string` \| `string`[]\>

Defined in: [src/config.registry.ts:91](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/config.registry.ts#L91)

Headers to add or override in upstream HTTP requests.

***

### responseHeadersToRemove?

> `optional` **responseHeadersToRemove?**: `string`[]

Defined in: [src/config.registry.ts:100](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/config.registry.ts#L100)

Response headers to remove before sending responses to clients.

***

### responseOverrides?

> `optional` **responseOverrides?**: `Record`\<`string`, `string` \| `string`[]\>

Defined in: [src/config.registry.ts:94](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/config.registry.ts#L94)

Headers to add or override in responses sent to clients.
