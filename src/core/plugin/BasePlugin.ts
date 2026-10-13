import type { PluginEventMap } from "../event/plugin-events/pluginEvents";
import type { RequestContext } from "../scope/types";

/**
 * Provides contextual information about the proxy session and request
 * associated with a plugin event.
 */
export type PluginContext = {
  /** Information about the current proxy session. */
  session: {
    /** Unique identifier of the proxy session. */
    id: string;

    /** Protocol information associated with the session. */
    protocol: {
      /** Type of connection established with the proxy, when known. */
      connectionType?: "tcp" | "http" | "https";

      /** HTTP version negotiated or detected for the connection, when known. */
      httpVersion?: "h1" | "h2" | "h3" | "unknown";
    };
  };

  /** Context associated with the current request. */
  request: RequestContext;
};

/**
 * Base class for implementing plugins that handle plugin events.
 *
 * Each plugin must declare the event it handles through {@link event}
 * and implement the corresponding handler through {@link run}.
 *
 * The generic parameter associates the plugin's event and payload types
 * with the keys defined in {@link PluginEventMap}.
 *
 * @typeParam K - The key of the plugin event handled by this plugin.
 *
 * @example
 * ```ts
 * class RequestPlugin extends BasePlugin<"proxy:client-http-request"> {
 *   readonly event = "proxy:client-http-request" as const;
 *
 *   run(payload: PluginEventMap["proxy:client-http-request"][0]) {
 *     // Handle the proxy:client-http-request event.
 *   }
 * }
 * ```
 */
export abstract class BasePlugin<K extends keyof PluginEventMap> {
  /**
   * Identifies the plugin event this plugin handles.
   *
   * The value must be a key of {@link PluginEventMap} and determines
   * the payload type received by {@link run}.
   */
  abstract readonly event: K;

  /**
   * Executes the plugin's event-handling logic.
   *
   * The payload type is inferred from the event declared by {@link event}.
   * If the event map defines its arguments as a tuple, the first tuple
   * element is used as the handler payload.
   *
   * Implementations may complete synchronously or asynchronously.
   *
   * @param payload - The payload associated with the plugin event.
   * @returns Nothing, or a promise that resolves when the handler completes.
   */
  abstract run(
    payload: PluginEventMap[K] extends unknown[]
      ? PluginEventMap[K][0]
      : PluginEventMap[K],
  ): Promise<void> | void;

  /**
   * Initializes the plugin during proxy initialization.
   *
   * Use this hook to prepare resources required by the plugin, such as
   * connections, caches, or other state.
   *
   * This hook is optional and may complete synchronously or asynchronously.
   *
   * @returns A promise that resolves when initialization completes, or
   *          nothing if initialization is synchronous.
   */
  init?(): Promise<void> | void;

  /**
   * Releases resources owned by the plugin during proxy shutdown.
   *
   * Use this hook to close connections, clear timers, or flush buffered
   * data and logs.
   *
   * This hook is optional and may complete synchronously or asynchronously.
   *
   * @returns A promise that resolves when cleanup completes, or
   *          nothing if cleanup is synchronous.
   */
  cleanup?(): Promise<void> | void;

  /**
   * Gets the plugin's class name.
   *
   * By default, this value is derived from the runtime constructor name
   * and can be used to identify the plugin in logs and debugging output.
   */
  get name(): string {
    return this.constructor.name;
  }
}
