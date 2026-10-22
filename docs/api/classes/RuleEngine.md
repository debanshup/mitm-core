[mitm-core](../globals.md) / RuleEngine

# Abstract Class: RuleEngine\<T\>

Defined in: [src/core/rule/RuleEngine.ts:23](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/RuleEngine.ts#L23)

Abstract base class for managing file-backed rule configurations.
Provides a factory for creating concrete rule-engine instances and a
shared registry of their associated rule stores. Subclasses define the
rule name, configuration path, parser, and initial state.

## Example

```ts
class PortRuleEngine extends RuleEngine<number[]> {
  // Implement the required rule-engine properties.
}
```

For a complete implementation, see the
[rule engine example](https://github.com/debanshup/mitm-core/blob/main/example/advanced/rules/bypass.Rule.ts).

## Type Parameters

### T

`T`

The type of state managed by the rule engine.

## Constructors

### Constructor

> **new RuleEngine**\<`T`\>(): `RuleEngine`\<`T`\>

#### Returns

`RuleEngine`\<`T`\>

## Properties

### store

> **store**: [`WatchableRuleFile`](../interfaces/WatchableRuleFile.md)\<`T`\>

Defined in: [src/core/rule/RuleEngine.ts:44](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/RuleEngine.ts#L44)

Rule store associated with this engine instance.

Assigned by [createRule](#createrule) when the instance is created through
the factory method.

## Methods

### createRule()

> `static` **createRule**\<`E`\>(`ChildClass`): `E`

Defined in: [src/core/rule/RuleEngine.ts:56](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/RuleEngine.ts#L56)

Constructs a concrete rule engine and creates its associated rule store.

The store is registered under the instance's rule name and assigned
to the resulting engine instance.

#### Type Parameters

##### E

`E` *extends* `RuleEngine`\<`any`\>

The concrete rule-engine type.

#### Parameters

##### ChildClass

new () => `E`

Constructor of the rule-engine subclass to instantiate.

#### Returns

`E`

The created rule-engine instance.

***

### getRuleStore()

> `static` **getRuleStore**(`storeName`): [`WatchableRuleFile`](../interfaces/WatchableRuleFile.md)\<`any`\> \| `undefined`

Defined in: [src/core/rule/RuleEngine.ts:82](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/rule/RuleEngine.ts#L82)

Retrieves a rule store registered under the specified name.

#### Parameters

##### storeName

`string`

Name used to register the rule store.

#### Returns

[`WatchableRuleFile`](../interfaces/WatchableRuleFile.md)\<`any`\> \| `undefined`

The matching store, or `undefined` if no store is registered
         under that name.
