import type { PluginEventMap } from "../event/plugin-events/pluginEvents";

/**
 * Extracts the payload type associated with a plugin event.
 *
 * If the event map defines its value as an argument tuple, the first
 * tuple element is used as the payload type. Otherwise, the event map
 * value itself is used.
 *
 * @typeParam K - The plugin event key from {@link PluginEventMap}.
 * @returns The payload type associated with the specified plugin event.
 */
export type PluginPayload<K extends keyof PluginEventMap> =
  PluginEventMap[K] extends unknown[]
    ? PluginEventMap[K][0]
    : PluginEventMap[K];

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
 *  For a complete implementation, see the
 * [Plugin example](https://github.com/debanshup/mitm-core/blob/main/example/advanced/plugins/wsIntercept.plugin.ts).
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
  abstract run(payload: PluginPayload<K>): Promise<void> | void;

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
