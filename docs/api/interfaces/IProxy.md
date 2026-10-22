[mitm-core](../globals.md) / IProxy

# Interface: IProxy

Defined in: [src/lib/Proxy.ts:29](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/lib/Proxy.ts#L29)

Interface for the Proxy class, managing plugin execution,
HTTP server events, and lifecycle management.

## Methods

### listen()

> **listen**(`port`, `callback?`): `Promise`\<`void`\>

Defined in: [src/lib/Proxy.ts:57](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/lib/Proxy.ts#L57)

Starts the proxy's HTTP server.

#### Parameters

##### port

`number`

Port to listen on. Use 0 to request an available port.

##### callback?

() => `void` \| `Promise`\<`void`\>

Optional callback invoked after the server starts.

#### Returns

`Promise`\<`void`\>

A promise representing startup.

***

### stop()

> **stop**(`shutdownTimeoutMs?`): `Promise`\<`void`\>

Defined in: [src/lib/Proxy.ts:67](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/lib/Proxy.ts#L67)

Gracefully shuts down the proxy, allowing active requests to drain
until the shutdown timeout expires before forcing cleanup.

#### Parameters

##### shutdownTimeoutMs?

`number`

Maximum time to wait for active requests.
Defaults to 1500 ms.

#### Returns

`Promise`\<`void`\>

A promise that resolves when shutdown completes.

***

### unuse()

> **unuse**(`plugin`): `this`

Defined in: [src/lib/Proxy.ts:48](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/lib/Proxy.ts#L48)

Unregisters a plugin before the proxy starts.
Does nothing if the plugin is not registered.

#### Parameters

##### plugin

[`BasePlugin`](../classes/BasePlugin.md)\<`any`\>

Plugin to unregister.

#### Returns

`this`

The current proxy instance for chaining.

#### Throws

If the proxy is starting, running, or has been stopped.

***

### use()

> **use**\<`K`\>(`plugin`): `this`

Defined in: [src/lib/Proxy.ts:38](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/lib/Proxy.ts#L38)

Registers a plugin before the proxy starts.
Duplicate registration of the same plugin instance is ignored.

#### Type Parameters

##### K

`K` *extends* keyof [`PluginEventMap`](PluginEventMap.md)

#### Parameters

##### plugin

[`BasePlugin`](../classes/BasePlugin.md)\<`K`\>

Plugin to register.

#### Returns

`this`

The current proxy instance for chaining.

#### Throws

If the proxy is starting, running, or has been stopped.
