[mitm-core](../globals.md) / Proxy

# Class: Proxy

Defined in: [src/lib/Proxy.ts:73](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L73)

The main proxy server implementation.

## Hierarchy

[View Summary](../hierarchy.md)

### Extends

- `TypedEventEmitter`\<[`ProxyEventMap`](../interfaces/ProxyEventMap.md)\>

## Implements

- [`IProxy`](../interfaces/IProxy.md)

## Constructors

### Constructor

> **new Proxy**(`options?`): `Proxy`

Defined in: [src/lib/Proxy.ts:345](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L345)

Creates and configures a proxy instance.

Uses the provided HTTP server or creates a new one, applies the
configured defaults, initializes plugin event handling, registers
middleware pipelines, binds proxy events, and registers the global
proxy configuration.

#### Parameters

##### options?

[`ProxyOptions`](../type-aliases/ProxyOptions.md) = `{}`

Configuration options for the proxy instance.

#### Returns

`Proxy`

#### Remarks

- Certificate caching is enabled by default.
- Response caching is disabled by default.
- Default processing pipelines are enabled by default.
- Handshake timeout defaults to 10 seconds.
- Upstream timeout defaults to 30 seconds.
- Plugin execution timeout defaults to 10 seconds.
- If no root CA credentials are provided, empty key and certificate
  values are used.

#### Example

```ts
const proxy = new Proxy({
  useResponseCache: true,
  handshakeTimeoutMs: 15_000,
  upstreamTimeoutMs: 45_000,
});
```

#### Overrides

`TypedEventEmitter<ProxyEventMap>.constructor`

## Properties

### listeners

> **listeners**: `any`

Defined in: [src/lib/Proxy.ts:312](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L312)

Returns the registered listeners for the specified event.

The returned callbacks are typed according to the event's argument tuple.

#### Type Param

**K**

The event key.

#### Param

**event**

The event whose listeners should be retrieved.

#### Returns

An array of listener callbacks.

#### Overrides

`TypedEventEmitter.listeners`

***

### captureRejections

> `static` **captureRejections**: `boolean`

Defined in: node\_modules/@types/node/events.d.ts:416

Value: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type)

Change the default `captureRejections` option on all new `EventEmitter` objects.

#### Since

v13.4.0, v12.16.0

#### Inherited from

`TypedEventEmitter.captureRejections`

***

### captureRejectionSymbol

> `readonly` `static` **captureRejectionSymbol**: *typeof* [`captureRejectionSymbol`](#capturerejectionsymbol)

Defined in: node\_modules/@types/node/events.d.ts:409

Value: `Symbol.for('nodejs.rejection')`

See how to write a custom `rejection handler`.

#### Since

v13.4.0, v12.16.0

#### Inherited from

`TypedEventEmitter.captureRejectionSymbol`

***

### defaultMaxListeners

> `static` **defaultMaxListeners**: `number`

Defined in: node\_modules/@types/node/events.d.ts:455

By default, a maximum of `10` listeners can be registered for any single
event. This limit can be changed for individual `EventEmitter` instances
using the `emitter.setMaxListeners(n)` method. To change the default
for _all_`EventEmitter` instances, the `events.defaultMaxListeners` property
can be used. If this value is not a positive number, a `RangeError` is thrown.

Take caution when setting the `events.defaultMaxListeners` because the
change affects _all_ `EventEmitter` instances, including those created before
the change is made. However, calling `emitter.setMaxListeners(n)` still has
precedence over `events.defaultMaxListeners`.

This is not a hard limit. The `EventEmitter` instance will allow
more listeners to be added but will output a trace warning to stderr indicating
that a "possible EventEmitter memory leak" has been detected. For any single
`EventEmitter`, the `emitter.getMaxListeners()` and `emitter.setMaxListeners()` methods can be used to
temporarily avoid this warning:

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();
emitter.setMaxListeners(emitter.getMaxListeners() + 1);
emitter.once('event', () => {
  // do stuff
  emitter.setMaxListeners(Math.max(emitter.getMaxListeners() - 1, 0));
});
```

The `--trace-warnings` command-line flag can be used to display the
stack trace for such warnings.

The emitted warning can be inspected with `process.on('warning')` and will
have the additional `emitter`, `type`, and `count` properties, referring to
the event emitter instance, the event's name and the number of attached
listeners, respectively.
Its `name` property is set to `'MaxListenersExceededWarning'`.

#### Since

v0.11.2

#### Inherited from

`TypedEventEmitter.defaultMaxListeners`

***

### errorMonitor

> `readonly` `static` **errorMonitor**: *typeof* [`errorMonitor`](#errormonitor)

Defined in: node\_modules/@types/node/events.d.ts:402

This symbol shall be used to install a listener for only monitoring `'error'` events. Listeners installed using this symbol are called before the regular `'error'` listeners are called.

Installing a listener using this symbol does not change the behavior once an `'error'` event is emitted. Therefore, the process will still crash if no
regular `'error'` listener is installed.

#### Since

v13.6.0, v12.17.0

#### Inherited from

`TypedEventEmitter.errorMonitor`

## Methods

### \[captureRejectionSymbol\]()?

> `optional` **\[captureRejectionSymbol\]**\<`K`\>(`error`, `event`, ...`args`): `void`

Defined in: node\_modules/@types/node/events.d.ts:103

#### Type Parameters

##### K

`K`

#### Parameters

##### error

`Error`

##### event

`string` \| `symbol`

##### args

...`AnyRest`

#### Returns

`void`

#### Inherited from

`TypedEventEmitter.[captureRejectionSymbol]`

***

### addListener()

> **addListener**\<`K`\>(`event`, `listener`): `this`

Defined in: [src/lib/Proxy.ts:287](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L287)

#### Type Parameters

##### K

`K` *extends* keyof [`ProxyEventMap`](../interfaces/ProxyEventMap.md)

#### Parameters

##### event

`K`

##### listener

[`ProxyEventMap`](../interfaces/ProxyEventMap.md)\[`K`\] *extends* `any`[] ? (...`args`) => `void` \| `Promise`\<`void`\> : `never`

#### Returns

`this`

#### Overrides

`TypedEventEmitter.addListener`

***

### address()

> **address**(): `string` \| `AddressInfo` \| `null`

Defined in: [src/lib/Proxy.ts:589](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L589)

#### Returns

`string` \| `AddressInfo` \| `null`

***

### emit()

> **emit**\<`K`\>(`event`, ...`args`): `boolean`

Defined in: [src/core/event/EventBus.ts:85](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/EventBus.ts#L85)

Emits the specified event synchronously.

Registered listeners are invoked according to Node.js EventEmitter
semantics. This method does not wait for promises returned by listeners.

#### Type Parameters

##### K

`K` *extends* `"error"` \| `"connection:open"` \| `"connect:request"` \| `"connect:before"` \| `"connect:established"` \| `"http:request"` \| `"https:request"` \| `"ws:request"` \| `"ws:established"` \| `"ws:client-message"` \| `"ws:upstream-message"` \| `"ws:close"` \| `"ws:error"`

The event key.

#### Parameters

##### event

`K`

The event to emit.

##### args

...[`ProxyEventMap`](../interfaces/ProxyEventMap.md)\[`K`\] *extends* `any`[] ? `any`\[`any`\] : \[\]

Arguments associated with the event.

#### Returns

`boolean`

`true` if the event had listeners, otherwise `false`.

#### Inherited from

`TypedEventEmitter.emit`

***

### emitAsync()

> **emitAsync**\<`K`\>(`eventName`, ...`args`): `Promise`\<`void`\>

Defined in: [src/core/event/EventBus.ts:168](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/EventBus.ts#L168)

Executes all listeners for an event concurrently and asynchronously.

Each listener is invoked, and its return value is normalized to a
promise. This method waits for all listener promises to settle before
completing, even if one or more listeners reject.

If no listeners are registered, the method resolves immediately.

If a single listener rejects, its rejection reason is thrown directly.
If multiple listeners reject, an aggregate error is thrown containing
their error messages.

#### Type Parameters

##### K

`K` *extends* keyof [`ProxyEventMap`](../interfaces/ProxyEventMap.md)

The event key.

#### Parameters

##### eventName

`K`

The event to emit.

##### args

...[`ProxyEventMap`](../interfaces/ProxyEventMap.md)\[`K`\] *extends* `any`[] ? `any`\[`any`\] : `never`[]

Arguments associated with the event.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all listeners succeed.

#### Throws

The rejection reason when one listener fails, or an aggregate
        error when multiple listeners fail.

#### Inherited from

`TypedEventEmitter.emitAsync`

***

### eventNames()

> **eventNames**(): (`string` \| `symbol`)[]

Defined in: node\_modules/@types/node/events.d.ts:958

Returns an array listing the events for which the emitter has registered
listeners. The values in the array are strings or `Symbol`s.

```js
import { EventEmitter } from 'node:events';

const myEE = new EventEmitter();
myEE.on('foo', () => {});
myEE.on('bar', () => {});

const sym = Symbol('symbol');
myEE.on(sym, () => {});

console.log(myEE.eventNames());
// Prints: [ 'foo', 'bar', Symbol(symbol) ]
```

#### Returns

(`string` \| `symbol`)[]

#### Since

v6.0.0

#### Inherited from

`TypedEventEmitter.eventNames`

***

### getMaxListeners()

> **getMaxListeners**(): `number`

Defined in: node\_modules/@types/node/events.d.ts:810

Returns the current max listener value for the `EventEmitter` which is either
set by `emitter.setMaxListeners(n)` or defaults to [EventEmitter.defaultMaxListeners](#defaultmaxlisteners).

#### Returns

`number`

#### Since

v1.0.0

#### Inherited from

`TypedEventEmitter.getMaxListeners`

***

### listen()

> **listen**(`port`, `callback?`): `Promise`\<`void`\>

Defined in: [src/lib/Proxy.ts:510](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L510)

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

#### Implementation of

[`IProxy`](../interfaces/IProxy.md).[`listen`](../interfaces/IProxy.md#listen)

***

### listenerCount()

> **listenerCount**(`eventName`, `listener?`): `number`

Defined in: [src/core/event/EventBus.ts:123](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/core/event/EventBus.ts#L123)

Returns the number of listeners listening for the event named `eventName`.
If `listener` is provided, it will return how many times the listener is found
in the list of the listeners of the event.

#### Parameters

##### eventName

`string` \| `symbol`

The name of the event being listened for

##### listener?

(...`args`) => `void`

The event handler function

#### Returns

`number`

#### Since

v3.2.0

#### Inherited from

`TypedEventEmitter.listenerCount`

***

### off()

> **off**\<`K`\>(`event`, `listener`): `this`

Defined in: [src/lib/Proxy.ts:277](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L277)

Removes a previously registered listener for the specified event.

The listener must match the callback registered with the emitter.

#### Type Parameters

##### K

`K` *extends* keyof [`ProxyEventMap`](../interfaces/ProxyEventMap.md)

The event key.

#### Parameters

##### event

`K`

The event from which to remove the listener.

##### listener

[`ProxyEventMap`](../interfaces/ProxyEventMap.md)\[`K`\] *extends* `any`[] ? (...`args`) => `void` \| `Promise`\<`void`\> : `never`

The listener callback to remove.

#### Returns

`this`

This emitter instance for method chaining.

#### Overrides

`TypedEventEmitter.off`

***

### on()

> **on**\<`K`\>(`event`, `listener`): `this`

Defined in: [src/lib/Proxy.ts:257](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L257)

Registers a listener for the specified event.

The listener's parameters are inferred from the argument tuple
associated with the event in the event map.

#### Type Parameters

##### K

`K` *extends* keyof [`ProxyEventMap`](../interfaces/ProxyEventMap.md)

The event key.

#### Parameters

##### event

`K`

The event to listen for.

##### listener

[`ProxyEventMap`](../interfaces/ProxyEventMap.md)\[`K`\] *extends* `any`[] ? (...`args`) => `void` \| `Promise`\<`void`\> : `never`

The callback invoked when the event is emitted.

#### Returns

`this`

This emitter instance for method chaining.

#### Overrides

`TypedEventEmitter.on`

***

### once()

> **once**\<`K`\>(`event`, `listener`): `this`

Defined in: [src/lib/Proxy.ts:267](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L267)

Registers a listener that is invoked at most once for the specified event.

The listener's parameters are inferred from the event's argument tuple.

#### Type Parameters

##### K

`K` *extends* keyof [`ProxyEventMap`](../interfaces/ProxyEventMap.md)

The event key.

#### Parameters

##### event

`K`

The event to listen for.

##### listener

[`ProxyEventMap`](../interfaces/ProxyEventMap.md)\[`K`\] *extends* `any`[] ? (...`args`) => `void` \| `Promise`\<`void`\> : `never`

The callback invoked the first time the event is emitted.

#### Returns

`this`

This emitter instance for method chaining.

#### Overrides

`TypedEventEmitter.once`

***

### prependListener()

> **prependListener**\<`K`\>(`eventName`, `listener`): `this`

Defined in: node\_modules/@types/node/events.d.ts:922

Adds the `listener` function to the _beginning_ of the listeners array for the
event named `eventName`. No checks are made to see if the `listener` has
already been added. Multiple calls passing the same combination of `eventName`
and `listener` will result in the `listener` being added, and called, multiple times.

```js
server.prependListener('connection', (stream) => {
  console.log('someone connected!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Type Parameters

##### K

`K`

#### Parameters

##### eventName

`string` \| `symbol`

The name of the event.

##### listener

(...`args`) => `void`

The callback function

#### Returns

`this`

#### Since

v6.0.0

#### Inherited from

`TypedEventEmitter.prependListener`

***

### prependOnceListener()

> **prependOnceListener**\<`K`\>(`eventName`, `listener`): `this`

Defined in: node\_modules/@types/node/events.d.ts:938

Adds a **one-time**`listener` function for the event named `eventName` to the _beginning_ of the listeners array. The next time `eventName` is triggered, this
listener is removed, and then invoked.

```js
server.prependOnceListener('connection', (stream) => {
  console.log('Ah, we have our first user!');
});
```

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Type Parameters

##### K

`K`

#### Parameters

##### eventName

`string` \| `symbol`

The name of the event.

##### listener

(...`args`) => `void`

The callback function

#### Returns

`this`

#### Since

v6.0.0

#### Inherited from

`TypedEventEmitter.prependOnceListener`

***

### rawListeners()

> **rawListeners**\<`K`\>(`eventName`): `Function`[]

Defined in: node\_modules/@types/node/events.d.ts:854

Returns a copy of the array of listeners for the event named `eventName`,
including any wrappers (such as those created by `.once()`).

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();
emitter.once('log', () => console.log('log once'));

// Returns a new Array with a function `onceWrapper` which has a property
// `listener` which contains the original listener bound above
const listeners = emitter.rawListeners('log');
const logFnWrapper = listeners[0];

// Logs "log once" to the console and does not unbind the `once` event
logFnWrapper.listener();

// Logs "log once" to the console and removes the listener
logFnWrapper();

emitter.on('log', () => console.log('log persistently'));
// Will return a new Array with a single function bound by `.on()` above
const newListeners = emitter.rawListeners('log');

// Logs "log persistently" twice
newListeners[0]();
emitter.emit('log');
```

#### Type Parameters

##### K

`K`

#### Parameters

##### eventName

`string` \| `symbol`

#### Returns

`Function`[]

#### Since

v9.4.0

#### Inherited from

`TypedEventEmitter.rawListeners`

***

### removeAllListeners()

> **removeAllListeners**(`event?`): `this`

Defined in: [src/lib/Proxy.ts:305](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L305)

Removes all listeners for the specified event, or all events when
no event is provided.

#### Parameters

##### event?

`"error"` \| `"connection:open"` \| `"connect:request"` \| `"connect:before"` \| `"connect:established"` \| `"http:request"` \| `"https:request"` \| `"ws:request"` \| `"ws:established"` \| `"ws:client-message"` \| `"ws:upstream-message"` \| `"ws:close"` \| `"ws:error"`

The event whose listeners should be removed.
              If omitted, listeners for all events are removed.

#### Returns

`this`

This emitter instance for method chaining.

#### Overrides

`TypedEventEmitter.removeAllListeners`

***

### removeListener()

> **removeListener**\<`K`\>(`event`, `listener`): `this`

Defined in: [src/lib/Proxy.ts:296](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L296)

#### Type Parameters

##### K

`K` *extends* keyof [`ProxyEventMap`](../interfaces/ProxyEventMap.md)

#### Parameters

##### event

`K`

##### listener

[`ProxyEventMap`](../interfaces/ProxyEventMap.md)\[`K`\] *extends* `any`[] ? (...`args`) => `void` \| `Promise`\<`void`\> : `never`

#### Returns

`this`

#### Overrides

`TypedEventEmitter.removeListener`

***

### setMaxListeners()

> **setMaxListeners**(`n`): `this`

Defined in: node\_modules/@types/node/events.d.ts:804

By default `EventEmitter`s will print a warning if more than `10` listeners are
added for a particular event. This is a useful default that helps finding
memory leaks. The `emitter.setMaxListeners()` method allows the limit to be
modified for this specific `EventEmitter` instance. The value can be set to `Infinity` (or `0`) to indicate an unlimited number of listeners.

Returns a reference to the `EventEmitter`, so that calls can be chained.

#### Parameters

##### n

`number`

#### Returns

`this`

#### Since

v0.3.5

#### Inherited from

`TypedEventEmitter.setMaxListeners`

***

### stop()

> **stop**(`shutdownTimeoutMs?`): `Promise`\<`void`\>

Defined in: [src/lib/Proxy.ts:576](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L576)

Gracefully shuts down the proxy, allowing active requests to drain
until the shutdown timeout expires before forcing cleanup.

#### Parameters

##### shutdownTimeoutMs?

`number` = `1500`

Maximum time to wait for active requests.
Defaults to 1500 ms.

#### Returns

`Promise`\<`void`\>

A promise that resolves when shutdown completes.

#### Implementation of

[`IProxy`](../interfaces/IProxy.md).[`stop`](../interfaces/IProxy.md#stop)

***

### unuse()

> **unuse**(`plugin`): `this`

Defined in: [src/lib/Proxy.ts:494](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L494)

Unregisters a plugin before the proxy starts.
Does nothing if the plugin is not registered.

#### Parameters

##### plugin

[`BasePlugin`](BasePlugin.md)\<`any`\>

Plugin to unregister.

#### Returns

`this`

The current proxy instance for chaining.

#### Throws

If the proxy is starting, running, or has been stopped.

#### Implementation of

[`IProxy`](../interfaces/IProxy.md).[`unuse`](../interfaces/IProxy.md#unuse)

***

### use()

> **use**\<`K`\>(`plugin`): `this`

Defined in: [src/lib/Proxy.ts:473](https://github.com/debanshup/mitm-core/blob/dfb6027f18c318943aaee5b4934da609ddd35af2/src/lib/Proxy.ts#L473)

Registers a plugin before the proxy starts.
Duplicate registration of the same plugin instance is ignored.

#### Type Parameters

##### K

`K` *extends* keyof [`PluginEventMap`](../interfaces/PluginEventMap.md)

#### Parameters

##### plugin

[`BasePlugin`](BasePlugin.md)\<`K`\>

Plugin to register.

#### Returns

`this`

The current proxy instance for chaining.

#### Throws

If the proxy is starting, running, or has been stopped.

#### Implementation of

[`IProxy`](../interfaces/IProxy.md).[`use`](../interfaces/IProxy.md#use)

***

### addAbortListener()

> `static` **addAbortListener**(`signal`, `resource`): `Disposable`

Defined in: node\_modules/@types/node/events.d.ts:394

Listens once to the `abort` event on the provided `signal`.

Listening to the `abort` event on abort signals is unsafe and may
lead to resource leaks since another third party with the signal can
call `e.stopImmediatePropagation()`. Unfortunately Node.js cannot change
this since it would violate the web standard. Additionally, the original
API makes it easy to forget to remove listeners.

This API allows safely using `AbortSignal`s in Node.js APIs by solving these
two issues by listening to the event such that `stopImmediatePropagation` does
not prevent the listener from running.

Returns a disposable so that it may be unsubscribed from more easily.

```js
import { addAbortListener } from 'node:events';

function example(signal) {
  signal.addEventListener('abort', (e) => e.stopImmediatePropagation());
  // addAbortListener() returns a disposable, so the `using` keyword ensures
  // the abort listener is automatically removed when this scope exits.
  using _ = addAbortListener(signal, (e) => {
    // Do something when signal is aborted.
  });
}
```

#### Parameters

##### signal

`AbortSignal`

##### resource

(`event`) => `void`

#### Returns

`Disposable`

Disposable that removes the `abort` listener.

#### Since

v20.5.0

#### Inherited from

`TypedEventEmitter.addAbortListener`

***

### getEventListeners()

> `static` **getEventListeners**(`emitter`, `name`): `Function`[]

Defined in: node\_modules/@types/node/events.d.ts:319

Returns a copy of the array of listeners for the event named `eventName`.

For `EventEmitter`s this behaves exactly the same as calling `.listeners` on
the emitter.

For `EventTarget`s this is the only way to get the event listeners for the
event target. This is useful for debugging and diagnostic purposes.

```js
import { getEventListeners, EventEmitter } from 'node:events';

{
  const ee = new EventEmitter();
  const listener = () => console.log('Events are fun');
  ee.on('foo', listener);
  console.log(getEventListeners(ee, 'foo')); // [ [Function: listener] ]
}
{
  const et = new EventTarget();
  const listener = () => console.log('Events are fun');
  et.addEventListener('foo', listener);
  console.log(getEventListeners(et, 'foo')); // [ [Function: listener] ]
}
```

#### Parameters

##### emitter

`EventEmitter`\<`DefaultEventMap`\> \| `EventTarget`

##### name

`string` \| `symbol`

#### Returns

`Function`[]

#### Since

v15.2.0, v14.17.0

#### Inherited from

`TypedEventEmitter.getEventListeners`

***

### getMaxListeners()

> `static` **getMaxListeners**(`emitter`): `number`

Defined in: node\_modules/@types/node/events.d.ts:348

Returns the currently set max amount of listeners.

For `EventEmitter`s this behaves exactly the same as calling `.getMaxListeners` on
the emitter.

For `EventTarget`s this is the only way to get the max event listeners for the
event target. If the number of event handlers on a single EventTarget exceeds
the max set, the EventTarget will print a warning.

```js
import { getMaxListeners, setMaxListeners, EventEmitter } from 'node:events';

{
  const ee = new EventEmitter();
  console.log(getMaxListeners(ee)); // 10
  setMaxListeners(11, ee);
  console.log(getMaxListeners(ee)); // 11
}
{
  const et = new EventTarget();
  console.log(getMaxListeners(et)); // 10
  setMaxListeners(11, et);
  console.log(getMaxListeners(et)); // 11
}
```

#### Parameters

##### emitter

`EventEmitter`\<`DefaultEventMap`\> \| `EventTarget`

#### Returns

`number`

#### Since

v19.9.0

#### Inherited from

`TypedEventEmitter.getMaxListeners`

***

### listenerCount()

#### Call Signature

> `static` **listenerCount**(`emitter`, `eventName`): `number`

Defined in: node\_modules/@types/node/events.d.ts:290

Returns the number of registered listeners for the event named `eventName`.

For `EventEmitter`s this behaves exactly the same as calling `.listenerCount`
on the emitter.

For `EventTarget`s this is the only way to obtain the listener count. This can
be useful for debugging and diagnostic purposes.

##### Parameters

###### emitter

`EventEmitter`

###### eventName

`string` \| `symbol`

##### Returns

`number`

##### Since

v0.9.12

##### Inherited from

`TypedEventEmitter.listenerCount`

#### Call Signature

> `static` **listenerCount**(`emitter`, `eventName`): `number`

Defined in: node\_modules/@types/node/events.d.ts:291

Returns the number of registered listeners for the event named `eventName`.

For `EventEmitter`s this behaves exactly the same as calling `.listenerCount`
on the emitter.

For `EventTarget`s this is the only way to obtain the listener count. This can
be useful for debugging and diagnostic purposes.

##### Parameters

###### emitter

`EventTarget`

###### eventName

`string`

##### Returns

`number`

##### Since

v0.9.12

##### Inherited from

`TypedEventEmitter.listenerCount`

***

### on()

#### Call Signature

> `static` **on**(`emitter`, `eventName`, `options?`): `AsyncIterator`\<`any`[]\>

Defined in: node\_modules/@types/node/events.d.ts:270

```js
import { on, EventEmitter } from 'node:events';
import process from 'node:process';

const ee = new EventEmitter();

// Emit later on
process.nextTick(() => {
  ee.emit('foo', 'bar');
  ee.emit('foo', 42);
});

for await (const event of on(ee, 'foo')) {
  // The execution of this inner block is synchronous and it
  // processes one event at a time (even with await). Do not use
  // if concurrent execution is required.
  console.log(event); // prints ['bar'] [42]
}
// Unreachable here
```

Returns an `AsyncIterator` that iterates `eventName` events. It will throw
if the `EventEmitter` emits `'error'`. It removes all listeners when
exiting the loop. The `value` returned by each iteration is an array
composed of the emitted event arguments.

An `AbortSignal` can be used to cancel waiting on events:

```js
import { on, EventEmitter } from 'node:events';
import process from 'node:process';

const ac = new AbortController();

(async () => {
  const ee = new EventEmitter();

  // Emit later on
  process.nextTick(() => {
    ee.emit('foo', 'bar');
    ee.emit('foo', 42);
  });

  for await (const event of on(ee, 'foo', { signal: ac.signal })) {
    // The execution of this inner block is synchronous and it
    // processes one event at a time (even with await). Do not use
    // if concurrent execution is required.
    console.log(event); // prints ['bar'] [42]
  }
  // Unreachable here
})();

process.nextTick(() => ac.abort());
```

Use the `close` option to specify an array of event names that will end the iteration:

```js
import { on, EventEmitter } from 'node:events';
import process from 'node:process';

const ee = new EventEmitter();

// Emit later on
process.nextTick(() => {
  ee.emit('foo', 'bar');
  ee.emit('foo', 42);
  ee.emit('close');
});

for await (const event of on(ee, 'foo', { close: ['close'] })) {
  console.log(event); // prints ['bar'] [42]
}
// the loop will exit after 'close' is emitted
console.log('done'); // prints 'done'
```

##### Parameters

###### emitter

`EventEmitter`

###### eventName

`string` \| `symbol`

###### options?

`StaticEventEmitterIteratorOptions`

##### Returns

`AsyncIterator`\<`any`[]\>

An `AsyncIterator` that iterates `eventName` events emitted by the `emitter`

##### Since

v13.6.0, v12.16.0

##### Inherited from

`TypedEventEmitter.on`

#### Call Signature

> `static` **on**(`emitter`, `eventName`, `options?`): `AsyncIterator`\<`any`[]\>

Defined in: node\_modules/@types/node/events.d.ts:275

```js
import { on, EventEmitter } from 'node:events';
import process from 'node:process';

const ee = new EventEmitter();

// Emit later on
process.nextTick(() => {
  ee.emit('foo', 'bar');
  ee.emit('foo', 42);
});

for await (const event of on(ee, 'foo')) {
  // The execution of this inner block is synchronous and it
  // processes one event at a time (even with await). Do not use
  // if concurrent execution is required.
  console.log(event); // prints ['bar'] [42]
}
// Unreachable here
```

Returns an `AsyncIterator` that iterates `eventName` events. It will throw
if the `EventEmitter` emits `'error'`. It removes all listeners when
exiting the loop. The `value` returned by each iteration is an array
composed of the emitted event arguments.

An `AbortSignal` can be used to cancel waiting on events:

```js
import { on, EventEmitter } from 'node:events';
import process from 'node:process';

const ac = new AbortController();

(async () => {
  const ee = new EventEmitter();

  // Emit later on
  process.nextTick(() => {
    ee.emit('foo', 'bar');
    ee.emit('foo', 42);
  });

  for await (const event of on(ee, 'foo', { signal: ac.signal })) {
    // The execution of this inner block is synchronous and it
    // processes one event at a time (even with await). Do not use
    // if concurrent execution is required.
    console.log(event); // prints ['bar'] [42]
  }
  // Unreachable here
})();

process.nextTick(() => ac.abort());
```

Use the `close` option to specify an array of event names that will end the iteration:

```js
import { on, EventEmitter } from 'node:events';
import process from 'node:process';

const ee = new EventEmitter();

// Emit later on
process.nextTick(() => {
  ee.emit('foo', 'bar');
  ee.emit('foo', 42);
  ee.emit('close');
});

for await (const event of on(ee, 'foo', { close: ['close'] })) {
  console.log(event); // prints ['bar'] [42]
}
// the loop will exit after 'close' is emitted
console.log('done'); // prints 'done'
```

##### Parameters

###### emitter

`EventTarget`

###### eventName

`string`

###### options?

`StaticEventEmitterIteratorOptions`

##### Returns

`AsyncIterator`\<`any`[]\>

An `AsyncIterator` that iterates `eventName` events emitted by the `emitter`

##### Since

v13.6.0, v12.16.0

##### Inherited from

`TypedEventEmitter.on`

***

### once()

#### Call Signature

> `static` **once**(`emitter`, `eventName`, `options?`): `Promise`\<`any`[]\>

Defined in: node\_modules/@types/node/events.d.ts:184

Creates a `Promise` that is fulfilled when the `EventEmitter` emits the given
event or that is rejected if the `EventEmitter` emits `'error'` while waiting.
The `Promise` will resolve with an array of all the arguments emitted to the
given event.

This method is intentionally generic and works with the web platform [EventTarget](https://dom.spec.whatwg.org/#interface-eventtarget) interface, which has no special`'error'` event
semantics and does not listen to the `'error'` event.

```js
import { once, EventEmitter } from 'node:events';
import process from 'node:process';

const ee = new EventEmitter();

process.nextTick(() => {
  ee.emit('myevent', 42);
});

const [value] = await once(ee, 'myevent');
console.log(value);

const err = new Error('kaboom');
process.nextTick(() => {
  ee.emit('error', err);
});

try {
  await once(ee, 'myevent');
} catch (err) {
  console.error('error happened', err);
}
```

The special handling of the `'error'` event is only used when `events.once()` is used to wait for another event. If `events.once()` is used to wait for the
'`error'` event itself, then it is treated as any other kind of event without
special handling:

```js
import { EventEmitter, once } from 'node:events';

const ee = new EventEmitter();

once(ee, 'error')
  .then(([err]) => console.log('ok', err.message))
  .catch((err) => console.error('error', err.message));

ee.emit('error', new Error('boom'));

// Prints: ok boom
```

An `AbortSignal` can be used to cancel waiting for the event:

```js
import { EventEmitter, once } from 'node:events';

const ee = new EventEmitter();
const ac = new AbortController();

async function foo(emitter, event, signal) {
  try {
    await once(emitter, event, { signal });
    console.log('event emitted!');
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Waiting for the event was canceled!');
    } else {
      console.error('There was an error', error.message);
    }
  }
}

foo(ee, 'foo', ac.signal);
ac.abort(); // Abort waiting for the event
ee.emit('foo'); // Prints: Waiting for the event was canceled!
```

##### Parameters

###### emitter

`EventEmitter`

###### eventName

`string` \| `symbol`

###### options?

`StaticEventEmitterOptions`

##### Returns

`Promise`\<`any`[]\>

##### Since

v11.13.0, v10.16.0

##### Inherited from

`TypedEventEmitter.once`

#### Call Signature

> `static` **once**(`emitter`, `eventName`, `options?`): `Promise`\<`any`[]\>

Defined in: node\_modules/@types/node/events.d.ts:189

Creates a `Promise` that is fulfilled when the `EventEmitter` emits the given
event or that is rejected if the `EventEmitter` emits `'error'` while waiting.
The `Promise` will resolve with an array of all the arguments emitted to the
given event.

This method is intentionally generic and works with the web platform [EventTarget](https://dom.spec.whatwg.org/#interface-eventtarget) interface, which has no special`'error'` event
semantics and does not listen to the `'error'` event.

```js
import { once, EventEmitter } from 'node:events';
import process from 'node:process';

const ee = new EventEmitter();

process.nextTick(() => {
  ee.emit('myevent', 42);
});

const [value] = await once(ee, 'myevent');
console.log(value);

const err = new Error('kaboom');
process.nextTick(() => {
  ee.emit('error', err);
});

try {
  await once(ee, 'myevent');
} catch (err) {
  console.error('error happened', err);
}
```

The special handling of the `'error'` event is only used when `events.once()` is used to wait for another event. If `events.once()` is used to wait for the
'`error'` event itself, then it is treated as any other kind of event without
special handling:

```js
import { EventEmitter, once } from 'node:events';

const ee = new EventEmitter();

once(ee, 'error')
  .then(([err]) => console.log('ok', err.message))
  .catch((err) => console.error('error', err.message));

ee.emit('error', new Error('boom'));

// Prints: ok boom
```

An `AbortSignal` can be used to cancel waiting for the event:

```js
import { EventEmitter, once } from 'node:events';

const ee = new EventEmitter();
const ac = new AbortController();

async function foo(emitter, event, signal) {
  try {
    await once(emitter, event, { signal });
    console.log('event emitted!');
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Waiting for the event was canceled!');
    } else {
      console.error('There was an error', error.message);
    }
  }
}

foo(ee, 'foo', ac.signal);
ac.abort(); // Abort waiting for the event
ee.emit('foo'); // Prints: Waiting for the event was canceled!
```

##### Parameters

###### emitter

`EventTarget`

###### eventName

`string`

###### options?

`StaticEventEmitterOptions`

##### Returns

`Promise`\<`any`[]\>

##### Since

v11.13.0, v10.16.0

##### Inherited from

`TypedEventEmitter.once`

***

### setMaxListeners()

> `static` **setMaxListeners**(`n?`, ...`eventTargets`): `void`

Defined in: node\_modules/@types/node/events.d.ts:363

```js
import { setMaxListeners, EventEmitter } from 'node:events';

const target = new EventTarget();
const emitter = new EventEmitter();

setMaxListeners(5, target, emitter);
```

#### Parameters

##### n?

`number`

A non-negative number. The maximum number of listeners per `EventTarget` event.

##### eventTargets

...(`EventEmitter`\<`DefaultEventMap`\> \| `EventTarget`)[]

Zero or more {EventTarget} or {EventEmitter} instances. If none are specified, `n` is set as the default max for all newly created {EventTarget} and {EventEmitter}
objects.

#### Returns

`void`

#### Since

v15.4.0

#### Inherited from

`TypedEventEmitter.setMaxListeners`
