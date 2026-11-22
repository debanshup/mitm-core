## Pipeline Control

`mitm-core` provides two mechanisms for controlling pipeline execution: `PipelineAbortSignal` and `lifecycle.isHijacked`.

### PipelineAbortSignal

Use `PipelineAbortSignal` when a plugin or handler intentionally wants to stop normal pipeline execution.

It accepts either a message string or structured abort metadata:

```ts
throw new PipelineAbortSignal("Request intentionally skipped");

// Structured abort metadata
throw new PipelineAbortSignal({
  message: "Request blocked by security policy",
  reason: "policy",
  plugin: this,
  event: this.event,
  cause: error,
});
```

The pipeline records the abort details in `scope.lifecycle.abort`, including the phase and timestamp.

Typical use cases:

- Blocking requests through policy rules.
- Rejecting unsupported operations.
- Stopping processing after a custom decision.
- Recording why a pipeline was intentionally terminated.

### Connection and Request Hijacking

Set `scope.lifecycle.isHijacked = true` when a plugin takes ownership of handling a request or connection.

After hijacking, the normal proxy processing flow is skipped. The plugin becomes responsible for completing the operation and managing the resources it owns.

Typical use cases:

- Establishing a custom TCP tunnel.
- Implementing TLS bypass.
- Returning locally generated responses.
- Implementing alternative request or transport handling.

### Using Both Together

These mechanisms can be combined when a plugin takes over a connection and also wants to record why normal pipeline execution stopped.

**Remember:** `PipelineAbortSignal` stops execution and records abort information. `isHijacked` indicates that ownership has been transferred. Neither mechanism automatically completes the response or manages custom sockets for the plugin.
