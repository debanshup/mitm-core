---
layout: home
title: mitm-core
titleTemplate: A proxy framework for Node.js
---

<div class="home-eyebrow">
  <span class="status-dot"></span>
  OPEN SOURCE
</div>

# See what moves<br />through your proxy.

A TypeScript proxy framework for intercepting and processing HTTP/1.1, HTTPS, WebSocket, and secure WebSocket traffic.

<div class="home-actions">
  <a class="action-primary" href="/getting-started">Get started <span>→</span></a>
  <a class="action-secondary" href="https://github.com/debanshup/mitm-core">View on GitHub ↗</a>
</div>

<div class="protocol-strip">
  <span>HTTP/1.1</span>
  <i></i>
  <span>HTTPS</span>
  <i></i>
  <span>WebSocket</span>
  <i></i>
  <span>Secure WebSocket</span>
</div>

## A proxy core you can build on

mitm-core gives Node.js applications a foundation for observing and customizing proxied traffic, with configurable processing, rules, and plugins.

<div class="feature-grid">
  <a class="feature-card" href="/proxy-events">
    <div class="feature-icon">↗</div>
    <h3>Observe the lifecycle</h3>
    <p>Subscribe to connection, request, WebSocket, and error events as traffic moves through the proxy.</p>
    <span class="feature-link">Explore proxy events →</span>
  </a>
  <a class="feature-card" href="/plugins">
    <div class="feature-icon">⌘</div>
    <h3>Extend with plugins</h3>
    <p>Add behavior through plugin lifecycle hooks and work with the request scope.</p>
    <span class="feature-link">Read the plugin guide →</span>
  </a>
  <a class="feature-card" href="/rules">
    <div class="feature-icon">◇</div>
    <h3>Control traffic with rules</h3>
    <p>Define matching rules and manage rule stores for decisions such as TLS bypass.</p>
    <span class="feature-link">Learn about rules →</span>
  </a>
  <a class="feature-card" href="/configuration">
    <div class="feature-icon">{ }</div>
    <h3>Configure the core</h3>
    <p>Set certificate handling, caching, pipelines, and timeout behavior to fit your use case.</p>
    <span class="feature-link">View configuration →</span>
  </a>
</div>

## Start in a few minutes

Install the package in your Node.js project:

```bash
npm install mitm-core
```

Create a proxy with your Root CA credentials:

```ts
import { readFileSync } from "node:fs";
import { Proxy } from "mitm-core";

const proxy = new Proxy({
  rootCa: {
    cert: readFileSync("./creds/__self__/CA.pem"),
    key: readFileSync("./creds/__self__/key.pem"),
  },
});

await proxy.listen(8001);
```

Then send a request through it:

```bash
curl -x http://127.0.0.1:8001 http://example.com/
```

HTTPS interception requires a Root CA and a client configured to trust it. Only inspect traffic you own or are authorized to inspect.

<div class="next-step">
  <div>
    <div class="next-step-kicker">DOCUMENTATION</div>
    <h2>Build with the core.</h2>
    <p>Start with installation, then explore events, rules, plugins, and configuration.</p>
  </div>
  <a class="action-primary" href="/getting-started">Read the guide <span>→</span></a>
</div>