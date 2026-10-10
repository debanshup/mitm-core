import { TypedEventEmitter } from "../EventBus";
import type { RequestScope } from "../../scope/types";
import { PipelineAbortSignal } from "../../signals/pipelineAbortSignal";
import { getConfig } from "../../../config.registry";
const config = getConfig();

/**
 * Context provided to plugins when intercepting a WebSocket message.
 *
 * Allows a plugin to inspect or modify the message payload and decide
 * whether the message should be forwarded.
 */
export interface WsMessageContext {
  /** WebSocket message payload represented as a Buffer. */
  data: Buffer;

  /** Indicates whether the message is a binary message. */
  isBinary: boolean;

  /**
   * Indicates whether the message should be dropped instead of forwarded.
   *
   * Set this to true to prevent forwarding the message.
   */
  drop: boolean;
}

/**
 * Defines the events exposed by the proxy's plugin event system.
 *
 * Events cover client-side connection and request processing, upstream
 * connection and request lifecycle, response handling, errors, and
 * WebSocket message interception.
 *
 * Each event maps to a tuple describing the arguments passed to its
 * registered listeners. Event payloads provide access to the relevant
 * {@link RequestScope} and, where applicable, message-specific context.
 */
export interface PluginEventMap {
  // Layer 1: Client-side lifecycle

  /**
   * Fired when the proxy receives a client HTTP CONNECT request.
   *
   * This represents the start of CONNECT request processing, not a
   * generic TCP connection event.
   */
  "proxy:client-connect": [payload: { scope: RequestScope }];

  /**
   * Fired immediately before the proxy writes the successful CONNECT
   * response to the client.
   *
   * Use this event to inspect the request scope before the handshake
   * response is written.
   */
  "proxy:client-before-handshake": [payload: { scope: RequestScope }];

  /**
   * Fired after the successful CONNECT response has been written,
   * but before TLS interception setup has completed.
   */
  "proxy:client-after-handshake": [payload: { scope: RequestScope }];

  /**
   * Fired after the plain HTTP request state has been initialized
   * and before pipeline execution begins.
   */
  "proxy:client-http-request": [payload: { scope: RequestScope }];

  /**
   * Fired after the decrypted HTTPS request state has been initialized
   * and before pipeline execution begins.
   */
  "proxy:client-https-request": [payload: { scope: RequestScope }];

  /**
   * Fired when the upstream responds to a request with an HTTP upgrade.
   *
   * The WebSocket tunnel might not yet be fully established when this
   * event is emitted.
   */
  "proxy:client-upgrade": [payload: { scope: RequestScope }];

  // Layer 2: Upstream lifecycle

  /**
   * Fired after upstream request initialization and before the pipeline
   * continues processing the request.
   */
  "proxy:upstream-dispatch": [payload: { scope: RequestScope }];

  /**
   * Fired when the upstream socket connects.
   *
   * For HTTPS connections, the corresponding connection milestone is
   * associated with the secureConnect event.
   */
  "proxy:upstream-connect": [payload: { scope: RequestScope }];

  /**
   * Fired when the upstream request finishes writing its data.
   *
   * This does not indicate that the upstream server has responded.
   */
  "proxy:upstream-request": [payload: { scope: RequestScope }];

  // Layer 3: Response and message interception

  /**
   * Fired after upstream response state has been applied to the request
   * scope.
   */
  "proxy:target-response": [payload: { scope: RequestScope }];

  /**
   * Fired when the HTTP/1 outbound error-handling path reports an error.
   */
  "proxy:target-error": [payload: { scope: RequestScope }];

  /**
   * Fired before a client-originated WebSocket message is forwarded.
   *
   * Plugins can inspect or modify the message through `messageContext`.
   * Set `messageContext.drop` to true to prevent forwarding it.
   */
  "proxy:ws-client-message": [
    payload: { scope: RequestScope; messageContext: WsMessageContext },
  ];

  /**
   * Fired before an upstream-originated WebSocket message is forwarded.
   *
   * Plugins can inspect or modify the message through `messageContext`.
   * Set `messageContext.drop` to true to prevent forwarding it.
   */
  "proxy:ws-upstream-message": [
    payload: { scope: RequestScope; messageContext: WsMessageContext },
  ];
}

/**
 * Global event manager for proxy plugin hooks.
 *
 * Provides typed event registration and asynchronous listener execution
 * with a configurable timeout.
 *
 * The shared instance is used by proxy components, middleware, and
 * handlers to dispatch plugin lifecycle events.
 */
export class PluginEventManager extends TypedEventEmitter<PluginEventMap> {
  /**
   * Maximum time, in milliseconds, allowed for a plugin listener to execute
   * before the event emission fails with a timeout error.
   *
   * Initialized from the registered proxy configuration, falling back
   * to 10 seconds when the configured value is falsy.
   */
  private pluginTimeoutMs: number = config.pluginTimeoutMs || 10_000;

  /**
   * Updates the maximum execution time allowed for each plugin listener.
   *
   * A value less than or equal to zero disables the timeout and causes
   * listener execution to be awaited without a timer.
   *
   * @param ms - Timeout duration in milliseconds.
   */
  setPluginTimeout(ms: number): void {
    this.pluginTimeoutMs = ms;
  }

  /**
   * Executes listeners registered for an event sequentially.
   *
   * Each listener is awaited before the next listener starts. When the
   * timeout is enabled, each listener's execution is raced against its
   * own timeout.
   *
   * If a listener throws or rejects, the error is logged and propagated.
   * Pipeline abort signals are propagated without being treated as ordinary
   * plugin errors. A timeout is logged and propagated as an error.
   *
   * @typeParam K - The event key being emitted.
   * @param eventName - Name of the event to emit.
   * @param args - Arguments associated with the selected event.
   * @returns A promise that resolves after all listeners complete.
   * @throws If a listener fails, a pipeline abort signal is raised,
   *         or a listener exceeds the configured timeout.
   */
  override async emitAsync<K extends keyof PluginEventMap>(
    eventName: K,
    ...args: PluginEventMap[K] extends any[] ? PluginEventMap[K] : never[]
  ): Promise<void> {
    const listeners = this.listeners(eventName);
    if (listeners.length === 0) return;

    for (const listener of listeners) {
      const fn = listener as (...args: any[]) => void | Promise<void>;

      if (this.pluginTimeoutMs! <= 0) {
        await Promise.resolve(fn(...args));
        continue;
      }

      let timerId: NodeJS.Timeout | undefined;

      // 1. Initialize the plugin promise
      const pluginExecution = Promise.resolve(fn(...args));

      // 2. CRITICAL: Attach a "dummy" catch.
      // If the timeout wins the race, but the plugin throws an error 10 seconds later,
      // Node.js will crash with an UnhandledPromiseRejection unless this dummy catch exists.
      pluginExecution.catch(() => {});

      const timeoutTimer = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          reject(new Error("PLUGIN_TIMEOUT"));
        }, this.pluginTimeoutMs);
      });

      try {
        // 3. Race them!
        await Promise.race([pluginExecution, timeoutTimer]);
      } catch (error: any) {
        if (
          error instanceof PipelineAbortSignal ||
          error?.constructor?.name === "PipelineAbortSignal"
        ) {
          throw error; // Pass it up to the HandshakeHandler/PipelineCompiler cleanly
        }

        if (error.message === "PLUGIN_TIMEOUT") {
          console.error(
            `[PLUGIN_TIMEOUT_ABORT] Event: ${String(eventName)}, Execution exceeded limit of: ${this.pluginTimeoutMs}ms`,
          );
          throw error;
        }

        console.error(
          `[Plugin Internal Error] Event: ${String(eventName)} |`,
          error,
        );
        throw error;
      } finally {
        if (timerId) clearTimeout(timerId);
      }
    }
  }
}

/**
 * Shared singleton instance of {@link PluginEventManager}.
 *
 * Used by proxy components, middleware, and handlers to register and
 * dispatch typed plugin lifecycle events.
 *
 * The instance also provides asynchronous listener execution with
 * configurable timeouts through {@link PluginEventManager.setPluginTimeout}.
 */
export const pluginEventManager = new PluginEventManager();