[mitm-core](../globals.md) / WatchableRuleFile

# Interface: WatchableRuleFile\<T\>

Defined in: [src/core/rule/ruleStore.ts:58](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/ruleStore.ts#L58)

Manages a rule configuration file and keeps its parsed state available
for matching and updates.

Creates the parent directory and file when they do not exist, loads
the initial rules, and watches the file for changes. File-change events
trigger a debounced reload of the parsed rule state.

Supports matching targets against the current rules, appending formatted
rules when the parser provides a formatter, and releasing watcher resources.

## Type Parameters

### T

`T`

The parsed representation of the rule configuration.

## Properties

### filePath

> `readonly` **filePath**: `string`

Defined in: [src/core/rule/ruleStore.ts:64](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/ruleStore.ts#L64)

Absolute, normalized path to the rule configuration file.

***

### name

> `readonly` **name**: `string`

Defined in: [src/core/rule/ruleStore.ts:79](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/ruleStore.ts#L79)

Identifier used to associate the store with a rule engine.

## Methods

### appendRule()

> **appendRule**(`input`): `void`

Defined in: [src/core/rule/ruleStore.ts:147](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/ruleStore.ts#L147)

Formats and appends a rule to the configuration file.

Does nothing if the parser does not provide `formatForSave()` or
the input is already present in the pending-save set. Before writing,
checks whether the formatted rule already occurs in the file.

File changes are handled by the existing watcher and reload mechanism.
File I/O errors are logged rather than rethrown.

#### Parameters

##### input

`string`

Raw rule input to format and append.

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [src/core/rule/ruleStore.ts:169](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/ruleStore.ts#L169)

Stops the file watcher and clears any pending reload timer.

Call this when the store is no longer needed to release its
watcher and timer resources.

#### Returns

`void`

***

### match()

> **match**(`target`): `boolean`

Defined in: [src/core/rule/ruleStore.ts:131](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/ruleStore.ts#L131)

Checks whether a target matches the currently loaded rules.

#### Parameters

##### target

`string`

The target string to evaluate.

#### Returns

`boolean`

`true` if the parser reports a match; otherwise, `false`.
