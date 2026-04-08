# mitm-core

> **Documentation is under active development and coming soon!**

A high-performance, fully extensible Man-in-the-Middle (MITM) proxy framework for Node.js. Built completely in TypeScript, it provides a strictly-typed pipeline for intercepting, modifying, and analyzing HTTP/HTTPS traffic.

## Features

- **Native TLS Interception:** Dynamically generates and manages leaf certificates for spoofing HTTPS traffic on the fly.
- **Pipeline Architecture:** Traffic flows through distinct, hackable phases (`Handshake` -> `Request` -> `Response`).
- **Strictly Typed Event Bus:** Flawless IDE autocomplete for all proxy events (`payloadEvents`, `tlsLifecycleEvents`, etc.) using a custom generic event emitter.
- **Smart Rule Engine:** Automatically detects TLS pinning/handshake errors and safely bypasses specific domains via direct TCP tunneling.
- **Response Caching:** Built-in intelligent caching for intercepted HTTP responses.
- **Memory Safe:** Carefully designed stream pipelines and socket cleanup to prevent `ECONNABORTED` crashes and memory leaks.

## Quick Start

Here is a full example of bootstrapping the proxy, registering a custom bypass rule parser, and hooking into the network pipeline:

```typescript
import { Middleware, Proxy, RuleEngine, type IRuleParser } from "mitm-core";

// 1. Initialize the core proxy pipelines
Middleware.register({ initializePipelines: true });

// 2. Define a Rule Parser for dynamic routing/bypassing (optional)
export class RegexRuleParser implements IRuleParser<RegExp[]> {
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

// Register the parser to watch a specific file for TLS bypass rules (optional)
RuleEngine.register(
  "tls-bypass",
  "rules/bypass.rules.txt",
  new RegexRuleParser(),
  [],
);

// 3. Instantiate the Proxy
const proxy = new Proxy();

// ---  PIPELINE HOOKS ---

// Hook 1: Raw TCP Connection
proxy.onTCPconnection(async (socket, next) => {
  next();
});

// Hook 2: HTTP CONNECT (Pre-TLS Handshake)
proxy.onConnect(
  async (req, socket, head, { requestDataEvent, tlsEvent }, next) => {
    // Example: Inject custom certificates for a specific domain (example.com)
    tlsEvent.once("TLS:LEAF", ({ ctx }) => {
      ctx?.customCertificates?.set("example.com", {
        cert: "custom-cert-string",
        key: "custom-key-string",
      });
    });
    next();
  },
);

// Hook 3: Plain HTTP Request
proxy.onHttpRequest(async (req, res, next) => {
  next();
});

// Hook 4: Fully Decrypted Request
proxy.onDecryptedRequest(({ ctx }) => {
  console.info("Decrypted Upstream URL:", ctx.proxyToUpstreamUrl);
});

// 4. Start listening
proxy.listen(8001, () => {
  console.log("MITM Proxy listening on port 8001");
});
```

## Core Architecture

The proxy operates on a phased pipeline approach to ensure safe execution of asynchronous plugins:

1. **TCP Phase:** Raw socket connections are established.
2. **Handshake Phase:** The proxy determines if it should MITM or bypass the connection based on the `RuleEngine`. Leaf certs are generated and the TLS connection is secured.
3. **Request Phase:** The decrypted HTTP request from the client is parsed and sent to the upstream server.
4. **Response Phase:** The upstream response is intercepted, optionally cached, and piped back to the client.

## Roadmap

- [x] Core Pipeline & TCP Tunneling
- [x] Dynamic Certificate Generation
- [x] Async Plugin Support & Error Boundaries
- [ ] HTTP/2 Support
- [ ] WebSocket Interception
