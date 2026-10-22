[mitm-core](../globals.md) / PluginPayload

# Type Alias: PluginPayload\<K\>

> **PluginPayload**\<`K`\> = [`PluginEventMap`](../interfaces/PluginEventMap.md)\[`K`\] *extends* `unknown`[] ? [`PluginEventMap`](../interfaces/PluginEventMap.md)\[`K`\]\[`0`\] : [`PluginEventMap`](../interfaces/PluginEventMap.md)\[`K`\]

Defined in: [src/core/plugin/BasePlugin.ts:13](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/plugin/BasePlugin.ts#L13)

Extracts the payload type associated with a plugin event.

If the event map defines its value as an argument tuple, the first
tuple element is used as the payload type. Otherwise, the event map
value itself is used.

## Type Parameters

### K

`K` *extends* keyof [`PluginEventMap`](../interfaces/PluginEventMap.md)

The plugin event key from [PluginEventMap](../interfaces/PluginEventMap.md).

## Returns

The payload type associated with the specified plugin event.
