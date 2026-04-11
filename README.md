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
/**
 * mitm-core
 * Core Implementation & Dynamic Routing
 */
// 1. CORE INITIALIZATION
// Bootstraps internal pipeline state machines.
Middleware.register({ initializePipelines: true });

/**
 * 2. RULE ENGINE & PARSING
 * Handles dynamic routing and bypass logic.
 * Supports hot-reloading via file-watchers.
 */
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

// Register bypass rules
RuleEngine.register(
  "tls-bypass",
  "rules/bypass.rules.txt",
  new RegexRuleParser(),
  [],
);

/**
 * 3. PROXY SERVER & EVENT PIPELINES
 */
const proxy = new Proxy();

/**
 * RAW TCP LAYER
 * Low-level socket access immediately upon connection.
 */
proxy.on("tcp:connection", ({ socket }) => {
  socket.setNoDelay(true);
});

/**
 * TUNNEL HANDSHAKE
 * Processes the HTTP CONNECT verb before tunnel establishment.
 */
proxy.on(
  "tunnel:connect",
  ({ req, head, socket, events: { requestDataEvent, tlsEvent } }) => {
    // Initial request inspection logic.
  },
);

/**
 * PLAIN HTTP TRAFFIC
 * Handles standard HTTP (Port 80) traffic.
 */
proxy.on("http:plain_request", ({ req, res }) => {
  // Direct HTTP interception.
});

/**
 * MITM DECRYPTED REQUEST
 * Intercepts fully decrypted HTTPS requests.
 */
proxy.on("http:decrypted_request", ({ ctx }) => {
  // Header/Body modification post-decryption.
});

/**
 * MITM DECRYPTED RESPONSE
 * Intercepts upstream responses before re-encryption for the client.
 */
proxy.on("decrypted_response", ({ ctx }) => {
  // Response modification.
});

/**
 * TUNNEL PRE-ESTABLISH (Gateway Control)
 * Decision point for MITM interception vs. Direct TCP Passthrough.
 */
proxy.on("tunnel:pre_establish", async ({ ctx, socket }) => {
  const host = ctx.clientToProxyHost!;

  // Check if host matches bypass rules (e.g., default.exp-tas.com).
  if (RuleEngine.shouldBypass(host)) {
    // Execute blind TCP tunnel (no decryption).
    await Tunnel.createDirectTunnel(ctx);

    // Terminate middleware pipeline to prevent TLS HandshakeHandler.
    throw new PipelineAbortSignal();
  }
});

/**
 * TUNNEL ESTABLISHED
 * Triggered after '200 OK' response; begins TLS handshake interception.
 */
proxy.on("tunnel:established", async ({ ctx, socket }) => {
  // Initiates certificate forging/decryption logic.
});

// Start Proxy Engine
proxy.listen(8001);
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
