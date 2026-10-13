# Examples

This directory contains practical examples demonstrating how to use **mitm-core** to configure a proxy, subscribe to proxy events, extend request processing with plugins, and intercept WebSocket messages.

## Basic Proxy

Demonstrates how to create and start a proxy instance with TLS interception configured.

This example covers:

- Creating a `Proxy` instance.
- Configuring root CA credentials for HTTPS interception.
- Enabling certificate caching and configuring proxy options.
- Subscribing to connection, CONNECT, HTTP, and decrypted HTTPS events.
- Starting the proxy on a specified port.

## Advanced Proxy

Demonstrates how to extend proxy behavior using custom plugins and a rule engine.

This example combines TLS bypass handling with WebSocket message interception.

### TLS Bypass Plugin

The bypass plugin listens for the `proxy:client-before-handshake` event and checks whether the requested host matches a configured bypass rule.

When a host matches, the plugin establishes a direct TCP connection to the upstream host on port 443, forwards data between the client and upstream sockets, and aborts the remaining pipeline to prevent TLS interception.

### Bypass Rule Engine

The custom rule parser reads regular-expression patterns from a rule file and uses them to match target hosts.

The rule engine also provides a method to save hosts to the bypass list when explicitly forced or when an eligible TLS certificate error occurs.

### WebSocket Interception Plugin

The WebSocket plugin demonstrates how to handle client-to-upstream WebSocket messages and observe upstream-to-client messages.

It includes an example of modifying a matching client message before it is forwarded upstream, along with plugin initialization and cleanup hooks.

### Proxy Configuration

The advanced example demonstrates how to:

- Register multiple plugins using `proxy.use()`.
- Enable default processing pipelines.
- Configure certificate and response caching.
- Start the proxy with the configured plugins.

## Prerequisites

- Node.js and the project dependencies installed.
- The project built or configured to execute its TypeScript examples.
- Root CA credentials available at the path expected by the example.
- Appropriate local test targets for HTTP, HTTPS, and WebSocket traffic.

## Running the Examples

Run the desired example using the project's configured TypeScript execution or build workflow. Review its configuration before starting the proxy, and ensure the required certificates and test targets are available.

These examples are intended for local development and authorized testing. Only intercept traffic on systems and networks you own or have permission to test.
