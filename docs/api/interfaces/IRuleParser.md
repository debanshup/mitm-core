[mitm-core](../globals.md) / IRuleParser

# Interface: IRuleParser\<T\>

Defined in: [src/core/rule/ruleStore.ts:15](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/ruleStore.ts#L15)

Defines the parsing, matching, and optional formatting operations
for a rule configuration.

Implementations provide the logic for converting raw file content
into a typed rule representation, evaluating targets against those
rules, and formatting new rules for persistence.

## Type Parameters

### T

`T`

The parsed representation of the rule configuration.

## Methods

### formatForSave()?

> `optional` **formatForSave**(`input`): `string`

Defined in: [src/core/rule/ruleStore.ts:42](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/ruleStore.ts#L42)

Optionally formats an input value for appending to the rule file.

Implementations can use this method to normalize or serialize
a new rule before it is persisted.

#### Parameters

##### input

`string`

The input value to format.

#### Returns

`string`

The formatted rule string.

***

### match()

> **match**(`rules`, `target`): `boolean`

Defined in: [src/core/rule/ruleStore.ts:31](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/ruleStore.ts#L31)

Evaluates whether a target matches the parsed rules.

#### Parameters

##### rules

`T`

The parsed rules to evaluate.

##### target

`string`

The target string to check.

#### Returns

`boolean`

`true` if the target matches the rules; otherwise, `false`.

***

### parse()

> **parse**(`rawContent`): `T`

Defined in: [src/core/rule/ruleStore.ts:22](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/ruleStore.ts#L22)

Parses raw configuration file content into the rule representation.

#### Parameters

##### rawContent

`string`

The complete configuration file content.

#### Returns

`T`

The parsed rule representation.
