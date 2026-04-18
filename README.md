# mitm-core

> ⚠️ **EXPERIMENTAL** — This project is under active development. APIs, behavior, and internals may change without notice.

![Logo](https://github.com/debanshup/mitm-core/raw/main/assets/logo.png?raw=true)

**An optimized, scalable, and fully extensible Man-in-the-Middle (MITM) proxy framework for Node.js.**

Built entirely in TypeScript, `mitm-core` provides a strictly-typed, phased pipeline for intercepting, modifying, and analyzing HTTP/HTTPS traffic. It is designed as a composable core — not a standalone tool — intended to be embedded into security testing platforms, debugging proxies, traffic analyzers, and network tooling.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-ESM-green.svg)](https://nodejs.org/)

---

## Table of Contents

- [Prerequisites](#prerequisites)
  - [1. Generating the Root CA](#1-generating-the-root-ca)
  - [2. Trusting the Root CA](#2-trusting-the-root-ca)
    - [Windows](#windows)
    - [macOS](#macos)
    - [Linux (Ubuntu/Debian)](#linux-ubuntudebian)
- [Features](#features)
- [Architecture Overview](#architecture-overview)
  - [Key Components](#key-components)
- [Quick Start](#quick-start)
  - [1. Importing mitm-core](#1-importing-mitm-core)
  - [2. Basic Setup (Plain, Without Plugins)](#2-basic-setup-plain-without-plugins)
  - [3. Advanced Setup (With Plugins & Custom Rules)](#3-advanced-setup-with-plugins--custom-rules)
- [ProxyContext Reference](#proxycontext-reference)
  - [Connection State](#connection-state)
  - [Routing](#routing)
  - [Request Context (ctx.requestContext)](#request-context-ctxrequestcontext)
- [Proxy Events Reference](#proxy-events-reference)
  - [tcp:connection](#tcpconnection)
  - [tunnel:connect](#tunnelconnect)
  - [tunnel:pre_establish](#tunnelpre_establish)
  - [tunnel:established](#tunnelestablished)
  - [http:plain_request](#httpplain_request)
  - [http:decrypted_request](#httpdecrypted_request)
  - [decrypted_response](#decrypted_response)
  - [error](#error)
- [Scripts](#scripts)
- [Roadmap](#roadmap)
- [Security Notice](#security-notice)
- [Contributing](#contributing)
- [License](#license)

---

## Prerequisites

Because `mitm-core` intercepts HTTPS traffic by generating dynamic leaf certificates on the fly, it requires a local Root Certificate Authority (CA) to sign them.

Before starting the proxy, you must generate a Root CA and place it in the `creds/__self__` directory at the root of your project.

**Expected Directory Structure:**

```text
your-project/
├── creds/
│   └── __self__/
│       ├── CA.crt    (Your public Root CA)
│       └── key.pem   (Your private key)
├── package.json
└── index.js
```

### 1. Generating the Root CA

You can easily generate these files using `openssl`. Run the following commands in your terminal:

```bash
# Create the required directories
mkdir -p creds/__self__
cd creds/__self__

# 1. Generate a 2048-bit private key
openssl genrsa -out key.pem 2048

# 2. Generate the Root CA certificate (Valid for 10 years)
# It will prompt you for details (Country, Org, etc.). You can leave most blank,
# but set the "Common Name" to something recognizable like "mitm-core-root".
openssl req -x509 -new -nodes -key key.pem -sha256 -days 3650 -out CA.crt
```

### 2. Trusting the Root CA

For your OS and browser to accept the intercepted HTTPS traffic without throwing privacy errors, you must tell your system to trust the `CA.crt` file you just generated.

#### Windows

1. Double-click the `CA.crt` file.
2. Click **Install Certificate**.
3. Select **Local Machine** and click Next.
4. Choose **Place all certificates in the following store** and click **Browse**.
5. Select **Trusted Root Certification Authorities** and click OK, then Finish.

#### macOS

1. Open the terminal and run:

   ```bash
   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain CA.crt
   ```

   _(Alternatively: Double-click the `CA.crt` file to open Keychain Access, find the certificate, double-click it, expand the "Trust" section, and set "When using this certificate" to "Always Trust")._

#### Linux (Ubuntu/Debian)

1. Copy the certificate to the system store and update:

   ```bash
   sudo cp CA.crt /usr/local/share/ca-certificates/mitm-core.crt
   sudo update-ca-certificates
   ```

_(Note: Firefox uses its own certificate store. If you are testing with Firefox, you will need to manually import `CA.crt` in Firefox Settings -> Privacy & Security -> View Certificates)._

---

## Features

| Feature                          | Description                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Native TLS Interception**      | Dynamically generates and signs leaf certificates to intercept HTTPS traffic on the fly using `node-forge`.                          |
| **Phased Pipeline Architecture** | Traffic flows through clearly defined, hackable phases: `TCP → Handshake → Request → Response`.                                      |
| **Strictly Typed Event Bus**     | Full IDE autocomplete for all proxy events (`payloadEvents`, `tlsLifecycleEvents`, etc.) via a custom generic event emitter.         |
| **Extensible Rule Engine**       | A flexible framework for defining custom traffic rules, allowing developers to easily build logic like bypassing TLS pinned domains. |
| **Response Caching**             | Built-in LRU-based intelligent caching layer for intercepted HTTP responses.                                                         |
| **Worker Pool Support**          | Uses `piscina` for CPU-bound tasks (e.g., certificate generation) to avoid blocking the event loop.                                  |
| **Memory Safe**                  | Carefully designed stream pipelines and socket cleanup to prevent `ECONNABORTED` crashes and memory leaks.                           |
| **Async Plugin Support**         | All pipeline hooks are fully async with proper error boundaries.                                                                     |
| **Zero Runtime Bloat**           | Only two production dependencies: `lru-cache` and `piscina`.                                                                         |

---

## Architecture Overview

`mitm-core` intercepts network traffic through a four-phase pipeline. Each phase is independently hookable, making the system highly composable.

```text
Client
  │  (incoming connection)
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Proxy                                                              │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Middleware → Pipeline.compile()                            │    │
│  │                                                             │    │
│  │  Registers handlers per phase:                              │    │
│  │    • tcp      → TcpHandler                                  │    │
│  │    • connect  → ConnectHandler                              │    │
│  │    • request  → RequestHandler                              │    │
│  │    • response → ResponseHandler                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                            (once at startup)                        │
│---------------------------------------------------------------------│
│                            (per connection)                         │
│                                                                     │
│           Middleware -> Pipeline.run(ctx)                           |
│                    │                                                │
│                    ▼                                                │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  Phase: tcp                                                 │   │
│   │  TcpHandler                                                 │   │
│   │  • Creates ProxyContext for the incoming connection         │   │
│   │  • Attaches listeners to handle socket-level errors         │   │
│   └──────────────────────────────┬──────────────────────────────┘   │
│                                  │                                  │
│                                  ▼                                  │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  Phase: connect                                             │   │
│   │  ConnectHandler                                             │   │
│   │  • Generates leaf certificate (node-forge)                  │   │
│   │  • Performs TLS handshake with client                       │   │
│   │  • Decrypts the HTTPS request                               │   │
│   └──────────────────────────────┬──────────────────────────────┘   │
│                                  │                                  │
│                                  ▼                                  │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  Phase: request                                             │   │
│   │  RequestHandler                                             │   │
│   │  • Handles plain HTTP and decrypted HTTPS requests          │   │
│   │  • Processes and forwards request to upstream server        │   │
│   └──────────────────────────────┬──────────────────────────────┘   │
│                                  │                                  │
│                                  ▼                                  │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  Phase: response                                            │   │
│   │  ResponseHandler                                            │   │
│   │  • Fetches upstream response                                │   │
│   │  • Optionally caches via LRU cache                          │   │
│   │  • Sends response back to client                            │   │
│   └──────────────────────────────┬──────────────────────────────┘   │
│                                  │                                  │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │  (response)
                                   ▼
                                Client
```

### Key Components

- **`Proxy`** — The main proxy server implementation.
- **`Middleware`** — Manages middleware registration and orchestrates the proxy connection lifecycle. Configures event listeners to intercept network traffic, initializes request contexts, and triggers the processing pipeline.
- **`Pipeline`** — Orchestrates the proxy request lifecycle. Maps registered handlers to specific lifecycle phases, executes them sequentially, manages state transitions, and provides centralized error handling.
- **`Phase`** — Represents the distinct lifecycle stages within the pipeline: `tcp` (raw connection), `handshake` (protocol negotiation), `request` (client request), and `response` (upstream response).
- **`BaseHandler`** — Abstract base class for defining handler logic associated with a specific `Phase`. Subclasses must implement the `handle` method and declare their target `phase`.
- **`BasePlugin`** — Abstract base class for implementing plugins that hook into the proxy event system. Subclasses must specify the target event type and implement the `run` logic.
- **`RuleEngine<T>`** — Abstract base class that provides a framework for managing rule configurations. Handles file watching, state parsing, and storage for specific rule implementations.
- **`IRuleParser<T>`** — Defines the strategy for parsing, matching, and formatting rule files. Implementations provide the domain-specific logic to interpret raw file data.

## Quick Start

### 1. Importing `mitm-core`

**Using CommonJS (`require`)**

```js
const {
  Proxy,
  BasePlugin,
  PipelineAbortSignal,
  ProxyContext,
} = require("mitm-core");
```

**Using TypeScript / ES Modules (`import`)**

```ts
import {
  BasePlugin,
  PipelineAbortSignal,
  Proxy,
  ProxyContext,
} from "mitm-core";
```

---

### 2. Basic Setup (Plain, Without Plugins)

```ts
import { Proxy } from "mitm-core";
const proxy = new Proxy();
proxy.listen(8001); // listens to port 8001
```

---

### 3. Advanced Setup (With Plugins & Custom Rules)

```ts
import {
  BasePlugin,
  PipelineAbortSignal,
  Proxy,
  ProxyContext,
  RuleEngine,
} from "mitm-core";
import net from "net";
import { type IRuleParser } from "mitm-core";

// Custom parser to load and compile bypass regex rules from a file
export class BypassRuleParser implements IRuleParser<RegExp[]> {
  parse(raw: string): RegExp[] {
    return Array.from(
      new Set(
        raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#")),
      ),
    ).flatMap((l) => {
      try {
        return [new RegExp(l, "i")];
      } catch (error) {
        console.error(`Invalid regex skipped: "${l}"`);
        return [];
      }
    });
  }

  match(rules: RegExp[], target: string): boolean {
    return rules.some((r) => r.test(target));
  }

  formatForSave(host: string): string {
    const escapedHost = host.replace(/\./g, "\\.");
    return `^(?:[a-z0-9-]+\\.)*${escapedHost}$`;
  }
}

// Engine to manage, query, and update the bypass rule store
export class BypassRuleEngine extends RuleEngine<string[] | RegExp[]> {
  public readonly ruleName = "tls-bypass";
  public readonly relativePath = "rules/bypass.rules.txt";
  public readonly parser = new BypassRuleParser();
  public readonly defaultState: string[] = [];

  public match(storeName: string, target: string): boolean {
    const store = RuleEngine.getRuleStore(storeName);
    if (!store) {
      console.warn(`Rule store '${storeName}' not found.`);
      return false;
    }
    return store.match(target);
  }

  public shouldBypass(host: string): boolean {
    return this.match("tls-bypass", host);
  }

  public saveHostToBypass(host: string, error?: Error, force?: boolean) {
    if (this.shouldBypass(host)) return;
    const errorCode = error ? (error as any).code : undefined;
    if (!force) return;
    console.log(`Forcibly bypassing host: ${host}`);
    this.store.appendRule(host);
  }
}

// Plugin to intercept 'tunnel:pre_establish'
export class BypassPlugin extends BasePlugin<"tunnel:pre_establish"> {
  readonly event = "tunnel:pre_establish";
  private bypassEngine: BypassRuleEngine;

  constructor() {
    super();
    this.bypassEngine = RuleEngine.createRule(BypassRuleEngine);
  }

  async run({ ctx }: { ctx: ProxyContext }) {
    const host = ctx.clientToProxyHost;
    if (!host) return;

    if (this.bypassEngine.shouldBypass(host)) {
      const req = ctx.requestContext.req;
      const socket = req?.socket!;
      const hostHeader = req!.headers.host!;
      const [host, portStr] = hostHeader.split(":");
      const port = Number(portStr) || 443;

      // Establish direct connection to upstream server
      const upstream = net.connect(port, host, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (ctx.head && ctx.head.length > 0) {
          upstream.write(ctx.head);
        }
        // Pipe traffic directly (TCP Tunneling)
        socket!.pipe(upstream);
        upstream.pipe(socket!);
      });

      upstream.on("error", (err: any) => {
        console.error("Direct tunnel error:", ctx.clientToProxyHost, err);
        socket?.destroy();
      });

      upstream.setNoDelay(true);
      ctx.isHandled = true;

      // Stop the MITM processing pipeline for this request
      try {
      } finally {
        throw new PipelineAbortSignal();
      }
    }
  }
}

const proxy = new Proxy();
const bypassPlugin = new BypassPlugin();
proxy.use(bypassPlugin).listen(8001);
```

---

## ProxyContext Reference

The `ProxyContext` (`ctx`) maintains the state for each connection and request cycle.

### Connection State

Persists for the lifespan of the underlying TCP connection.

| Property             | Type                         | Description                                                              |
| :------------------- | :--------------------------- | :----------------------------------------------------------------------- |
| `connectionId`       | `string`                     | UUID for the TCP connection.                                             |
| `socket`             | `Duplex`                     | The underlying network stream.                                           |
| `connectionType`     | `"tcp" \| "http" \| "https"` | Current protocol layer.                                                  |
| `head`               | `any`                        | Initial buffer chunk for protocol sniffing.                              |
| `error`              | `Error`                      | Socket or handshake level errors.                                        |
| `isHandled`          | `boolean`                    | Set to `true` to halt pipeline execution if a plugin takes full control. |
| `customCertificates` | `Map`                        | Domain-specific overrides for MITM certificates.                         |

### Routing

Targeting and URL information.

| Property              | Type     | Description                                      |
| :-------------------- | :------- | :----------------------------------------------- |
| `clientToProxyHost`   | `string` | Original host/port the client intended to reach. |
| `proxyToUpstreamHost` | `string` | Destination host the proxy will dial.            |
| `clientToProxyUrl`    | `string` | Original URL requested by the client.            |
| `proxyToUpstreamUrl`  | `string` | Final URL requested upstream.                    |

### Request Context (`ctx.requestContext`)

Scoped to a single HTTP transaction. Cleared when the request finishes.

| Property      | Type              | Description                                     |
| :------------ | :---------------- | :---------------------------------------------- |
| `requestId`   | `string`          | UUID for this specific HTTP transaction.        |
| `req`         | `IncomingMessage` | Incoming client request.                        |
| `res`         | `ServerResponse`  | Response stream back to the client.             |
| `upstreamReq` | `ClientRequest`   | Outbound request to the target server.          |
| `upstreamRes` | `IncomingMessage` | Raw response from the target server.            |
| `state`       | `StateStore`      | Transaction-specific key-value store.           |
| `nextPhase`   | `Phase`           | Target phase for the next middleware execution. |

---

## Proxy Events Reference

`mitm-core` uses a fully asynchronous event emitter architecture. Attach listeners to specific lifecycle phases using `proxy.on()`.

### `tcp:connection`

Fires immediately when a raw TCP socket is accepted.

- **Payload:** `{ socket }`
- **Typical Use:** IP filtering, rate limiting, or socket-level configuration.

```javascript
proxy.on("tcp:connection", ({ socket }) => {
  if (isBlocked(socket.remoteAddress)) socket.destroy();
});
```

### `tunnel:connect`

Fires when an HTTP `CONNECT` request is received (the start of an HTTPS tunnel).

- **Payload:** `{ req, head, socket, payloadEvent }`
- **Typical Use:** Early domain filtering before TLS handshake, logging tunnel requests.

```javascript
proxy.on("tunnel:connect", ({ req, socket }) => {
  const targetHost = req.url;
  if (targetHost.includes("malicious.com")) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
  }
});
```

### `tunnel:pre_establish`

Fires right before the proxy generates a dynamic certificate and performs the TLS handshake.

- **Payload:** `{ ctx, socket }`
- **Typical Use:** TLS bypassing (direct TCP tunneling) for pinned apps, or injecting custom certificates.

```javascript
proxy.on("tunnel:pre_establish", async ({ ctx, socket }) => {
  if (shouldBypass(ctx.clientToProxyHost)) {
    // Implement direct TCP piping logic here
    ctx.isHandled = true; // Halt pipeline
  }
});
```

### `tunnel:established`

Fires after the TLS handshake with the client completes successfully.

- **Payload:** `{ ctx, socket }`
- **Typical Use:** Tracking active encrypted connections, logging handshake success.

```javascript
proxy.on("tunnel:established", async ({ ctx }) => {
  console.log(`[TLS Ready] ${ctx.clientToProxyHost}`);
});
```

### `http:plain_request`

Fires when unencrypted HTTP traffic is received.

- **Payload:** `{ req, res }`
- **Typical Use:** Plain HTTP inspection, header manipulation, or forcing HTTPS redirects.

```javascript
proxy.on("http:plain_request", ({ req, res }) => {
  res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
  res.end();
});
```

### `http:decrypted_request`

Fires when an HTTPS request is successfully decrypted by the proxy, before it goes upstream.

- **Payload:** `{ ctx }`
- **Typical Use:** Request body inspection, header modification, or serving cached responses.

```javascript
proxy.on("http:decrypted_request", ({ ctx }) => {
  const req = ctx.requestContext.req;
  req.headers["x-intercepted-by"] = "mitm-core";
});
```

### `decrypted_response`

Fires when a response is received from the upstream server, before returning to the client.

- **Payload:** `{ ctx }`
- **Typical Use:** Response body rewriting, header manipulation, or writing to cache.

```javascript
proxy.on("decrypted_response", ({ ctx }) => {
  const res = ctx.requestContext.upstreamRes;
  if (res.statusCode === 404) {
    console.log(`[404 Not Found] ${ctx.proxyToUpstreamUrl}`);
  }
});
```

### `error`

Fires when a global or pipeline-level error is caught.

- **Payload:** `err` (Standard Error object)
- **Typical Use:** Centralized error logging and metric collection.

```javascript
proxy.on("error", (err) => {
  console.error("[Proxy Error]:", err.message);
});
```

---

## Scripts

| Script      | Command                                              | Description                                             |
| ----------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `dev`       | `tsx watch --inspect ./example/with-plugin/Proxy.ts` | Start dev server with live reload and Node.js inspector |
| `build`     | `tsup`                                               | Compile TypeScript to `dist/`                           |
| `clean`     | `node -e "fs.rmSync('dist', ...)"`                   | Delete the `dist/` directory                            |
| `test`      | `mocha --config mocha.config.json`                   | Run the full test suite                                 |
| `typecheck` | `tsc --noEmit`                                       | Type-check without emitting files                       |
| `lint`      | `prettier --check src`                               | Check formatting across `src/`                          |
| `format`    | `prettier --write src`                               | Auto-format all files in `src/`                         |

> `prepublishOnly` automatically runs `test`, `lint`, and `typecheck` before any `npm publish`.

---

## Roadmap

- [x] Core Pipeline & TCP Tunneling
- [x] Dynamic Certificate Generation
- [x] Async Plugin Support & Error Boundaries
- [ ] HTTP/2 Support
- [ ] WebSocket Interception
- [ ] npm package publish

---

## Security Notice

> **This tool is intended for authorized security research, traffic analysis, and debugging only.**

Using `mitm-core` to intercept traffic on networks or systems you do not own or have explicit written permission to test is **illegal** in most jurisdictions. The author and contributors accept no liability for misuse. Always obtain proper authorization before deploying a MITM proxy.

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/debanshup/mitm-core/blob/main/CONTRIBUTING.md) to get started.

---

## License

MIT © [Debanshu Panigrahi](https://github.com/debanshup)

See [LICENSE](https://github.com/debanshup/mitm-core/blob/main/LICENSE) for full terms.
