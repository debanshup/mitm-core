[mitm-core](../globals.md) / SessionContext

# Type Alias: SessionContext

> **SessionContext** = `object`

Defined in: [src/core/scope/types.ts:19](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L19)

Contains connection-level information shared across requests handled
over the same underlying proxy connection.

Provides access to the network stream, protocol metadata, initial
connection data, and optional custom TLS certificates.

## Properties

### connectionId

> **connectionId**: `string`

Defined in: [src/core/scope/types.ts:26](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L26)

Unique identifier assigned to the underlying connection.

Useful for correlating logs and tracing requests associated with
the same connection, including requests over HTTP keep-alive.

***

### customCertificates?

> `optional` **customCertificates?**: `Map`\<`string`, \{ `cert`: `string` \| `Buffer`; `key`: `string` \| `Buffer`; \}\>

Defined in: [src/core/scope/types.ts:60](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L60)

Optional map of domain names to explicitly supplied TLS certificates.

When a matching entry is used by the certificate-selection logic,
these credentials take precedence over dynamically generated
certificates for that domain.

***

### head?

> `optional` **head?**: `Buffer` \| `null`

Defined in: [src/core/scope/types.ts:51](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L51)

Initial data received with the connection, if available.

May be used during protocol detection or TLS ClientHello inspection
before the proxy commits to a routing decision.

***

### protocol

> **protocol**: `object`

Defined in: [src/core/scope/types.ts:37](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L37)

Protocol information detected or established for this connection.

#### connectionType?

> `optional` **connectionType?**: `"tcp"` \| `"http"` \| `"https"`

Connection protocol, when identified.

#### httpVersion?

> `optional` **httpVersion?**: `"h1"` \| `"h2"` \| `"h3"` \| `"unknown"`

HTTP version associated with the connection, when identified.

***

### socket

> **socket**: `Duplex`

Defined in: [src/core/scope/types.ts:34](https://github.com/debanshup/mitm-core/blob/fc22de3fd8e4f2d9f11ff7f044d0c352707cfcca/src/core/scope/types.ts#L34)

The underlying readable and writable network stream.

Represents the connection stream used by the proxy. Its concrete
behavior depends on the connection and transport being handled.
