[mitm-core](../globals.md) / SessionContext

# Type Alias: SessionContext

> **SessionContext** = `object`

Defined in: [src/core/scope/types.ts:39](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L39)

Contains connection-level information shared across requests handled
over the same underlying proxy connection.

Provides access to the network stream, protocol metadata, initial
connection data, and optional custom TLS certificates.

## Properties

### connectionId

> **connectionId**: `string`

Defined in: [src/core/scope/types.ts:46](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L46)

Unique identifier assigned to the underlying connection.

Useful for correlating logs and tracing requests associated with
the same connection, including requests over HTTP keep-alive.

***

### customCertificates?

> `optional` **customCertificates?**: `Map`\<`string`, \{ `cert`: `string` \| `Buffer`; `key`: `string` \| `Buffer`; \}\>

Defined in: [src/core/scope/types.ts:80](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L80)

Optional map of domain names to explicitly supplied TLS certificates.

When a matching entry is used by the certificate-selection logic,
these credentials take precedence over dynamically generated
certificates for that domain.

***

### head?

> `optional` **head?**: `Buffer` \| `null`

Defined in: [src/core/scope/types.ts:71](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L71)

Initial data received with the connection, if available.

May be used during protocol detection or TLS ClientHello inspection
before the proxy commits to a routing decision.

***

### protocol

> **protocol**: `object`

Defined in: [src/core/scope/types.ts:57](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L57)

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

Defined in: [src/core/scope/types.ts:54](https://github.com/debanshup/mitm-core/blob/2440c2af08119a654bfebe7a287bbaee1753399e/src/core/scope/types.ts#L54)

The underlying readable and writable network stream.

Represents the connection stream used by the proxy. Its concrete
behavior depends on the connection and transport being handled.
