[mitm-core](../globals.md) / ProxyConfig

# Type Alias: ProxyConfig

> **ProxyConfig** = `object`

Defined in: [src/config.registry.ts:6](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/config.registry.ts#L6)

Configuration options for the proxy server, controlling caching,
TLS certificate handling, default pipeline registration, and timeouts.

## Properties

### handshakeTimeoutMs?

> `optional` **handshakeTimeoutMs?**: `number`

Defined in: [src/config.registry.ts:56](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/config.registry.ts#L56)

Maximum time, in milliseconds, to wait for the client to complete
the TLS ClientHello.

#### Default

```ts
10000
```

***

### leafCacheDir?

> `optional` **leafCacheDir?**: `string`

Defined in: [src/config.registry.ts:19](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/config.registry.ts#L19)

Directory used to store cached TLS leaf certificates.

#### Default

```ts
"~/.mitm-core"
```

***

### pluginTimeoutMs?

> `optional` **pluginTimeoutMs?**: `number`

Defined in: [src/config.registry.ts:72](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/config.registry.ts#L72)

Maximum time, in milliseconds, to wait for plugin execution to finish.
Set to 0 to disable the timeout completely.

#### Default

```ts
10000
```

***

### rootCa?

> `optional` **rootCa?**: `object`

Defined in: [src/config.registry.ts:42](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/config.registry.ts#L42)

Root Certificate Authority (CA) credentials used to sign generated
TLS leaf certificates during HTTPS interception.

The certificate and private key must be compatible CA credentials.

#### cert

> **cert**: `string` \| `Buffer`

CA certificate, provided as a PEM string or Buffer.

#### key

> **key**: `string` \| `Buffer`

CA private key, provided as a PEM string or Buffer.

***

### upstreamTimeoutMs?

> `optional` **upstreamTimeoutMs?**: `number`

Defined in: [src/config.registry.ts:64](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/config.registry.ts#L64)

Maximum time, in milliseconds, allowed for an upstream operation
before the configured timeout is reached.

#### Default

```ts
30000
```

***

### useCertificateCache?

> `optional` **useCertificateCache?**: `boolean`

Defined in: [src/config.registry.ts:12](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/config.registry.ts#L12)

Enables caching of generated TLS leaf certificates.

#### Default

```ts
true
```

***

### useDefaultPipelines?

> `optional` **useDefaultPipelines?**: `boolean`

Defined in: [src/config.registry.ts:34](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/config.registry.ts#L34)

Determines whether the default request and response processing
pipelines are registered.

#### Default

```ts
true
```

***

### useResponseCache?

> `optional` **useResponseCache?**: `boolean`

Defined in: [src/config.registry.ts:26](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/config.registry.ts#L26)

Enables caching of proxy responses to improve performance.

#### Default

```ts
false
```
