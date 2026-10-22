# Troubleshooting

This guide covers common issues encountered when installing, configuring, and using `mitm-core` for HTTP/HTTPS traffic interception and WebSocket forwarding.

## HTTPS requests fail with certificate errors

**Symptoms**

- The client reports a certificate verification error.
- HTTPS requests fail when passing through the proxy.
- `curl` reports errors such as `UNABLE_TO_VERIFY_LEAF_SIGNATURE` or `SELF_SIGNED_CERT_IN_CHAIN`.

**Cause**

During HTTPS interception, the proxy presents a certificate to the client. The client must trust the certificate authority (CA) used to sign that certificate.

**What to check**

1. Confirm that the proxy is configured with the appropriate root CA certificate and private key.
2. Verify that the client trusts the corresponding CA certificate.
3. Ensure the CA certificate and private key belong together.
4. Confirm that the requested hostname matches the certificate presented by the proxy.

For a local `curl` test, pass the CA certificate explicitly:

```bash
curl --proxy http://127.0.0.1:8001 \
  --cacert /path/to/CA.pem \
  https://example.com/
```

Replace the proxy address and CA path with your actual configuration.

**Security note:** Keep the CA private key secure. Only install and trust a proxy CA in environments where you explicitly intend to allow HTTPS interception.

## The proxy starts, but requests fail

**What to check**

- Confirm that the proxy is listening on the expected address and port.
- Verify that the client is configured to use the proxy.
- Check whether the destination host is reachable from the machine running the proxy.
- Inspect the logs for upstream connection errors, TLS failures, and timeout messages.

Test plain HTTP first:

```bash
curl -v -x http://127.0.0.1:8001 http://example.com/
```

Then test HTTPS separately using the trusted CA certificate described above.

Testing the protocols independently helps narrow down whether the problem is related to proxy connectivity, upstream communication, or TLS interception.

## Upstream requests time out

**Symptoms**

- Requests fail after a delay.
- The proxy reports an upstream timeout.
- The upstream server stops responding or remains inactive for too long.

**What happens**

For HTTP/1 upstream requests, the outbound bridge listens for the upstream request's `timeout` event. When it fires, the bridge creates an error with code `ERR_UPSTREAM_TIMEOUT` and destroys the upstream request.

If the client response can still be written, the proxy returns **504 Gateway Timeout** with a JSON response:

```json
{
  "error": "Gateway Timeout: Upstream failed to respond."
}
```

The response includes `Connection: close`.

**What to check**

1. Verify that the upstream host and port are reachable.
2. Check whether the upstream server is responding slowly or has stopped responding.
3. Review the configured `upstreamTimeoutMs` value.
4. Inspect the logs for the timeout warning and subsequent error handling.

`upstreamTimeoutMs` configures socket inactivity timeout behavior for upstream HTTP requests. It is not a hard deadline for the entire request and response lifecycle.

Increasing the timeout may help when a connection legitimately remains inactive for longer than expected. It will not fix unreachable hosts, DNS failures, or other connection errors.

## Upstream requests fail with 502 Bad Gateway

**Symptoms**

- The proxy returns `502 Bad Gateway`.
- The upstream connection is refused, reset, or closed unexpectedly.
- The logs contain upstream connection or request errors.

**What happens**

For HTTP/1 upstream request failures, the outbound bridge generally returns `502 Bad Gateway` when the client response is still writable and its headers have not been sent.

The upstream initialization failure path also returns `502 Bad Gateway` when possible.

If the response has already started, the proxy may destroy the response instead of attempting to send a second HTTP response.

**What to check**

- Verify the destination hostname and port.
- Confirm that the upstream service is running and reachable.
- Check the underlying error code, such as `ECONNREFUSED` or `ECONNRESET`.
- Determine whether the failure occurred while establishing the upstream connection or while streaming the response.

A `502` indicates that the proxy could not successfully complete the upstream operation. The exact underlying cause should be determined from the logs and error code.

## TLS handshake timeout

**Symptoms**

- HTTPS interception fails during the TLS handshake.
- The logs contain a `[TLS Timeout]` message.
- The pipeline reports a `TLS Handshake Timeout` error.

**What happens**

The handshake handler enforces the configured `handshakeTimeoutMs` limit. If the handshake has not settled when the timeout fires, the handler:

- Logs a TLS timeout diagnostic.
- Cleans up the relevant socket resources.
- Sets `request.error` to `true` in the request lifecycle state.
- Rejects with an error whose message is `TLS Handshake Timeout`.

The pipeline recognizes this message as an expected connection drop and suppresses the usual handler-error log. The error path still performs its applicable pipeline and response cleanup.

**What to check**

1. Confirm that the client is establishing the connection correctly.
2. Verify the root CA configuration and client trust settings.
3. Review the `handshakeTimeoutMs` setting.
4. Inspect nearby logs for socket errors or other TLS failures.

A handshake timeout is not necessarily a certificate error. Investigate the connection and handshake lifecycle before changing certificate configuration.

## WebSocket connections fail

**Symptoms**

- A WebSocket handshake fails.
- The connection closes shortly after being established.
- Messages are not forwarded in one or both directions.

**What to check**

- Confirm that the client uses the correct proxy configuration.
- Test `ws://` and `wss://` independently.
- For `wss://`, verify that the client trusts the proxy CA when TLS interception is enabled.
- Check whether a plugin modifies or drops WebSocket messages.
- Inspect logs for upstream connection failures and abnormal closure.

The WebSocket outbound bridge sends a `502 Bad Gateway` response when the upstream handshake request fails and the client socket is still writable.

For an established WebSocket tunnel, inspect the close and error events on both sides. A failure during the upstream handshake is different from a failure during message forwarding or tunnel teardown.

## Plugins are not executing as expected

### Check plugin registration

- Register plugins before calling `listen()`.
- Confirm that the plugin's `event` property matches the intended event name exactly.
- Ensure that the plugin implements `run()` with the appropriate payload type.
- Check whether plugin initialization failed before the server began listening.

Registering the same plugin instance more than once has no additional effect. Registration and unregistration are restricted after startup.

### Check the event name

The current plugin event map defines these events:

| Event                           | When it runs                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `proxy:client-connect`          | After CONNECT request state is initialized.                                              |
| `proxy:client-before-handshake` | Immediately before the successful CONNECT response is written.                           |
| `proxy:client-after-handshake`  | After the CONNECT response is written, before TLS interception setup completes.          |
| `proxy:client-http-request`     | After plain HTTP request state is initialized, before pipeline execution.                |
| `proxy:client-https-request`    | After decrypted HTTPS request state is initialized, before pipeline execution.           |
| `proxy:client-upgrade`          | When the upstream WebSocket upgrade response is received, before tunnel setup completes. |
| `proxy:upstream-dispatch`       | After upstream request initialization, before the pipeline continues.                    |
| `proxy:upstream-connect`        | When the upstream socket connects; HTTPS uses the secure connection milestone.           |
| `proxy:upstream-request`        | When the upstream request finishes writing its data.                                     |
| `proxy:target-response`         | After upstream response state is applied to the scope.                                   |
| `proxy:target-error`            | When the HTTP/1 outbound error-handling path reports an upstream error.                  |
| `proxy:ws-client-message`       | Before a client-originated WebSocket message is forwarded.                               |
| `proxy:ws-upstream-message`     | Before an upstream-originated WebSocket message is forwarded.                            |

The `proxy:upstream-request` event does not mean that the upstream response has arrived. Similarly, `proxy:client-upgrade` does not guarantee that the WebSocket tunnel is already established.

See [Plugin Events](./proxy-events.md) for the full event reference and examples.

### Check plugin lifecycle and timeout behavior

Plugin initialization runs sequentially before the server begins listening. Successfully initialized plugins are cleaned up in reverse order during shutdown.

Plugin listeners are also awaited sequentially. A slow listener can delay subsequent listeners and request processing.

The `pluginTimeoutMs` setting controls the per-listener timeout. A value of `0` disables the timeout.

A plugin timeout does not cancel the underlying asynchronous operation. A timed-out operation may continue running after the proxy stops waiting for it.

Plugin errors are logged and propagated through the plugin event manager. The surrounding handler determines how the error affects the request. The pipeline's general error handler may return `502` if a response can still be written, or destroy the response if headers have already been sent.

`PipelineAbortSignal` is handled separately to stop further pipeline execution without following the ordinary handler-error path.

## Custom rule files are not loading or updating

If you are using a custom rule engine built on the rule-store API, check the following:

- Verify the configured rule-file path.
- Remember that relative paths resolve against `process.cwd()`.
- Confirm that the process has permission to create, read, and write the file.
- Inspect logs for parsing and file I/O errors.
- Ensure the parser accepts the file contents.

The rule store creates missing parent directories and files. It loads the initial contents and watches for filesystem `change` events, reloading the parsed rules after a 200-millisecond debounce.

If parsing fails, the error is logged and the previously loaded rule state remains in memory.

The rule-store API is a building block for custom rule systems; the behavior of a particular rule format depends on its parser and implementation.

## Proxy shutdown or resource cleanup problems

**What to check**

- Confirm that `stop()` is called when the proxy is no longer needed.
- Check whether active connections are delaying graceful shutdown.
- Inspect logs for plugin cleanup errors.
- Destroy independently created rule stores when they are no longer needed.

The proxy attempts to stop accepting new connections and drain active requests before forcing shutdown after the configured shutdown timeout.

Initialized plugins are cleaned up in reverse initialization order. Cleanup errors are logged, and `stop()` may reject if plugin cleanup fails.

## Still having trouble?

When [reporting an issue](https://github.com/debanshup/mitm-core/issues/new), include:

- Node.js version and operating system.
- The `mitm-core` version.
- The proxy configuration, with secrets removed.
- The protocol being tested: HTTP, HTTPS, WS, or WSS.
- The exact error message and relevant logs.
- A minimal reproduction showing how the proxy is created and used.

Do not include private keys, credentials, authentication headers, or sensitive intercepted request and response data in bug reports.

## Related Guides

- [Getting Started](./getting-started.md)
- [Configuration](./configuration.md)
- [Plugins](./plugins.md)
- [Proxy Events](./proxy-events.md)
- [Rules](./rules.md)
