[mitm-core](../globals.md) / BasePlugin

# Abstract Class: BasePlugin\<K\>

Defined in: [src/core/plugin/BasePlugin.ts:43](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/plugin/BasePlugin.ts#L43)

Base class for implementing plugins that handle plugin events.

Each plugin must declare the event it handles through [event](#event)
and implement the corresponding handler through [run](#run).

The generic parameter associates the plugin's event and payload types
with the keys defined in [PluginEventMap](../interfaces/PluginEventMap.md).

## Example

```ts
class RequestPlugin extends BasePlugin<"proxy:client-http-request"> {
  readonly event = "proxy:client-http-request" as const;

  run(payload: PluginEventMap["proxy:client-http-request"][0]) {
    // Handle the proxy:client-http-request event.
  }
}
```
 For a complete implementation, see the
[Plugin example](https://github.com/debanshup/mitm-core/blob/main/example/advanced/plugins/wsIntercept.plugin.ts).

## Type Parameters

### K

`K` *extends* keyof [`PluginEventMap`](../interfaces/PluginEventMap.md)

The key of the plugin event handled by this plugin.

## Constructors

### Constructor

> **new BasePlugin**\<`K`\>(): `BasePlugin`\<`K`\>

#### Returns

`BasePlugin`\<`K`\>

## Properties

### event

> `abstract` `readonly` **event**: `K`

Defined in: [src/core/plugin/BasePlugin.ts:50](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/plugin/BasePlugin.ts#L50)

Identifies the plugin event this plugin handles.

The value must be a key of [PluginEventMap](../interfaces/PluginEventMap.md) and determines
the payload type received by [run](#run).

## Accessors

### name

#### Get Signature

> **get** **name**(): `string`

Defined in: [src/core/plugin/BasePlugin.ts:98](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/plugin/BasePlugin.ts#L98)

Gets the plugin's class name.

By default, this value is derived from the runtime constructor name
and can be used to identify the plugin in logs and debugging output.

##### Returns

`string`

## Methods

### cleanup()?

> `optional` **cleanup**(): `void` \| `Promise`\<`void`\>

Defined in: [src/core/plugin/BasePlugin.ts:90](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/plugin/BasePlugin.ts#L90)

Releases resources owned by the plugin during proxy shutdown.

Use this hook to close connections, clear timers, or flush buffered
data and logs.

This hook is optional and may complete synchronously or asynchronously.

#### Returns

`void` \| `Promise`\<`void`\>

A promise that resolves when cleanup completes, or
         nothing if cleanup is synchronous.

***

### init()?

> `optional` **init**(): `void` \| `Promise`\<`void`\>

Defined in: [src/core/plugin/BasePlugin.ts:77](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/plugin/BasePlugin.ts#L77)

Initializes the plugin during proxy initialization.

Use this hook to prepare resources required by the plugin, such as
connections, caches, or other state.

This hook is optional and may complete synchronously or asynchronously.

#### Returns

`void` \| `Promise`\<`void`\>

A promise that resolves when initialization completes, or
         nothing if initialization is synchronous.

***

### run()

> `abstract` **run**(`payload`): `void` \| `Promise`\<`void`\>

Defined in: [src/core/plugin/BasePlugin.ts:64](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/plugin/BasePlugin.ts#L64)

Executes the plugin's event-handling logic.

The payload type is inferred from the event declared by [event](#event).
If the event map defines its arguments as a tuple, the first tuple
element is used as the handler payload.

Implementations may complete synchronously or asynchronously.

#### Parameters

##### payload

[`PluginPayload`](../type-aliases/PluginPayload.md)\<`K`\>

The payload associated with the plugin event.

#### Returns

`void` \| `Promise`\<`void`\>

Nothing, or a promise that resolves when the handler completes.
