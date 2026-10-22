# Getting Started

`mitm-core` is a TypeScript-based proxy framework for intercepting and processing HTTP/1.1, HTTPS, WebSocket (`ws`), and secure WebSocket (`wss`) traffic.

## Requirements

- Node.js `>=20`
- npm `>=9`
- A Root Certificate Authority (CA) certificate and its corresponding private key for HTTPS interception.

## Installation

Install `mitm-core` in your Node.js project:

```bash
npm install mitm-core
```

## Root CA Setup

HTTPS interception requires a Root CA certificate and its corresponding private key.

You can store your CA credentials wherever you prefer. Make sure your application uses the correct paths to both files.

For example, you can organize your credentials like this:

```text
your-project/
├── creds/
│   └── __self__/
│       ├── CA.pem
│       └── key.pem
├── package.json
└── proxy.ts
```

**Note:** This directory structure and these filenames are examples only. You can use a different location or naming convention, provided your application is configured with the correct file paths.

### Generate a Root CA

You can generate a local Root CA using OpenSSL.

Create the directory:

```bash
mkdir -p creds/__self__
cd creds/__self__
```

Generate a 2048-bit private key:

```bash
openssl genrsa -out key.pem 2048
```

Generate a self-signed Root CA certificate valid for 10 years:

```bash
openssl req -x509 -new -nodes \
  -key key.pem \
  -sha256 \
  -days 3650 \
  -out CA.pem
```

When prompted, provide the certificate details. Set the **Common Name** to a recognizable name, such as `mitm-core-root`.

Keep the private key secure. Only use this CA for traffic you own or are authorized to inspect.

## Create a Proxy

Create a file named `proxy.ts`:

```ts
import { readFileSync } from "node:fs";
import { Proxy } from "mitm-core";

const proxy = new Proxy({
  rootCa: {
    cert: readFileSync("./creds/__self__/CA.pem"),
    key: readFileSync("./creds/__self__/key.pem"),
  },
  useDefaultPipelines: true,
  useCertificateCache: true,
  useResponseCache: false,
});

async function main() {
  await proxy.listen(8001);
}

main().catch((error) => {
  console.error("Failed to start proxy:", error);
  process.exitCode = 1;
});
```

The proxy listens on port `8001`. Configure your HTTP client to use `http://127.0.0.1:8001` as its proxy.

The example uses the default processing pipelines, enables TLS leaf certificate caching, and disables response caching.

## Test the Proxy

With the proxy running, test an HTTP request:

```bash
curl -x http://127.0.0.1:8001 http://example.com/
```

Test HTTPS interception by configuring `curl` to trust your Root CA certificate:

```bash
curl --proxy http://127.0.0.1:8001 \
  --cacert ./creds/__self__/CA.pem \
  https://example.com/
```

Both commands have been tested against the current proxy implementation.

## Stop the Proxy

Gracefully shut down the proxy using `stop()`:

```ts
await proxy.stop();
```

You can optionally specify the maximum time to wait for active requests to finish before forced cleanup. The default is 1500 milliseconds.

```ts
await proxy.stop(5000);
```

## Next Steps

- [Configuration](./configuration.md)
- [Plugins](./plugins.md)
- [Proxy Events](./proxy-events.md)
- [Rules](./rules.md)
- [Troubleshooting](./troubleshooting.md)
