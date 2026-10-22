# Configuration

`mitm-core` accepts configuration options through the `Proxy` constructor. These options control certificate caching, response caching, default processing pipelines, CA credentials, and timeout settings.

## Basic Configuration

```ts
import { readFileSync } from "node:fs";
import { Proxy } from "mitm-core";

const proxy = new Proxy({
  rootCa: {
    cert: readFileSync("./creds/__self__/CA.pem"),
    key: readFileSync("./creds/__self__/key.pem"),
  },
  useCertificateCache: true,
  leafCacheDir: "~/.mitm-core",
  useResponseCache: false,
  useDefaultPipelines: true,
  handshakeTimeoutMs: 10_000,
  upstreamTimeoutMs: 30_000,
  pluginTimeoutMs: 10_000,
});

await proxy.listen(8001);
```

All configuration options are optional. Unless otherwise noted, the defaults below are applied when an option is omitted.

## Configuration Options

| Option                | Type                                                | Default           | Description                                                                                                 |
| --------------------- | --------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `useCertificateCache` | `boolean`                                           | `true`            | Enables caching of generated TLS leaf certificates.                                                         |
| `leafCacheDir`        | `string`                                            | `~/.mitm-core`    | Directory used to store cached TLS leaf certificates.                                                       |
| `useResponseCache`    | `boolean`                                           | `false`           | Enables proxy response caching.                                                                             |
| `useDefaultPipelines` | `boolean`                                           | `true`            | Registers the default request and response processing pipelines.                                            |
| `rootCa`              | `{ key: string \| Buffer; cert: string \| Buffer }` | Empty credentials | Root CA private key and certificate used to sign generated TLS leaf certificates during HTTPS interception. |
| `handshakeTimeoutMs`  | `number`                                            | `10000`           | Maximum time, in milliseconds, to wait for the client to complete the TLS ClientHello.                      |
| `upstreamTimeoutMs`   | `number`                                            | `30000`           | Configures the socket inactivity timeout on upstream HTTP requests, in milliseconds.                        |
| `pluginTimeoutMs`     | `number`                                            | `10000`           | Maximum time, in milliseconds, allowed for plugin execution. Set to `0` to disable the plugin timeout.      |

## Root CA Credentials

HTTPS interception requires compatible Root CA credentials. Provide the certificate and its corresponding private key through `rootCa`.

```ts
import { readFileSync } from "node:fs";
import { Proxy } from "mitm-core";

const proxy = new Proxy({
  rootCa: {
    cert: readFileSync("./creds/__self__/CA.pem"),
    key: readFileSync("./creds/__self__/key.pem"),
  },
});
```

Both values accept a PEM-encoded string or a `Buffer`.

The paths above assume the CA files are located in `creds/__self__/` relative to the application's working directory. Adjust the paths to match your project.

If `rootCa` is omitted, the constructor uses empty key and certificate values. Supply valid CA credentials when HTTPS interception is required.

For instructions on generating a local Root CA, see [Getting Started](./getting-started.md#root-ca-setup).

Keep the CA private key secure. Clients that connect through the proxy must trust the CA certificate for intercepted HTTPS connections to validate successfully.

## Certificate Caching

Certificate caching is enabled by default. Generated TLS leaf certificates are stored in the directory configured by `leafCacheDir`.

By default, the cache directory is `~/.mitm-core` inside the user's home directory.

```ts
const proxy = new Proxy({
  useCertificateCache: true,
  leafCacheDir: "~/.mitm-core",
});
```

Set `useCertificateCache` to `false` to disable caching of generated TLS leaf certificates.

You can provide a custom directory through `leafCacheDir`:

```ts
const proxy = new Proxy({
  useCertificateCache: true,
  leafCacheDir: "./cache/tls",
});
```

Use a directory that the process can access. If you omit `leafCacheDir`, the proxy uses its default cache directory.

## Response Caching

Response caching is disabled by default.

```ts
const proxy = new Proxy({
  useResponseCache: true,
});
```

Set `useResponseCache` to `true` to enable the proxy's response-caching functionality. The caching behavior depends on the implementation and the requests being processed.

## Default Processing Pipelines

The default request and response processing pipelines are registered automatically unless disabled.

```ts
const proxy = new Proxy({
  useDefaultPipelines: true,
});
```

Setting `useDefaultPipelines` to `false` disables registration of the default pipelines. Use this option only if your application provides the required processing behavior through its own setup.

## Timeout Configuration

Timeout values are specified in milliseconds.

### TLS Handshake Timeout

The `handshakeTimeoutMs` option configures how long the proxy waits for the client to complete the TLS ClientHello.

Default: `10000` ms (10 seconds).

```ts
const proxy = new Proxy({
  handshakeTimeoutMs: 15_000,
});
```

### Upstream Socket Inactivity Timeout

The `upstreamTimeoutMs` option is passed to the upstream HTTP request's `timeout` setting.

Default: `30000` ms (30 seconds).

```ts
const proxy = new Proxy({
  upstreamTimeoutMs: 45_000,
});
```

This setting is an inactivity timeout, not a hard deadline for the entire request and response. Node.js does not automatically abort the request when this timeout fires; the application must handle the timeout event if it needs to terminate the operation.

The precise effect depends on how the proxy handles the upstream request's `timeout` event.

### Plugin Execution Timeout

The `pluginTimeoutMs` option configures the maximum time allowed for plugin execution.

Default: `10000` ms (10 seconds).

```ts
const proxy = new Proxy({
  pluginTimeoutMs: 5_000,
});
```

Set `pluginTimeoutMs` to `0` to disable the plugin timeout.

## Attach an Existing HTTP Server

By default, `Proxy` creates its own Node.js HTTP server. You can provide an existing `http.Server` through the `server` option instead.

```ts
import http from "node:http";
import { Proxy } from "mitm-core";

const server = http.createServer();

const proxy = new Proxy({
  server,
});

await proxy.listen(8001);
```

The proxy attaches its connection and request handlers to the supplied server.

## Complete Example

```ts
import { readFileSync } from "node:fs";
import { Proxy } from "mitm-core";

const proxy = new Proxy({
  rootCa: {
    cert: readFileSync("./creds/__self__/CA.pem"),
    key: readFileSync("./creds/__self__/key.pem"),
  },
  useCertificateCache: true,
  leafCacheDir: "~/.mitm-core",
  useResponseCache: false,
  useDefaultPipelines: true,
  handshakeTimeoutMs: 10_000,
  upstreamTimeoutMs: 30_000,
  pluginTimeoutMs: 10_000,
});

async function main() {
  await proxy.listen(8001);
}

main().catch((error) => {
  console.error("Failed to start proxy:", error);
  process.exitCode = 1;
});
```

## Related Guides

- [Getting Started](./getting-started.md)
- [Plugins](./plugins.md)
- [Proxy Events](./proxy-events.md)
- [Rules](./rules.md)
- [Troubleshooting](./troubleshooting.md)
