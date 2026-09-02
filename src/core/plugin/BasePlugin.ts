import type { PluginEventMap } from "../event/plugin-events/pluginEvents";

/**
 * An abstract base class for implementing plugins that hook into the proxy event system.
 * Subclasses must specify the target event type and implement the `run` logic.
 *
 * @template K The event key from {@link PluginEventMap}.
 */
export abstract class BasePlugin<K extends keyof PluginEventMap> {
  /**
   * The specific plugin event this plugin listens to.
   */
  abstract readonly event: K;

  /**
   * Executes the plugin logic when the associated event is triggered.
   *
   * @param payload The event data payload, inferred from {@link PluginEventMap}.
   */
  abstract run(
    payload: PluginEventMap[K] extends unknown[]
      ? PluginEventMap[K][0]
      : PluginEventMap[K],
  ): Promise<void> | void;

  /**
   * Optional lifecycle hook called when the proxy is initializing.
   * Use this to setup database connections, caches, or state.
   */
  async init?(): Promise<void>;

  /**
   * Optional lifecycle hook called when the proxy is shutting down.
   * Use this to clean up resources, clear intervals, or flush logs.
   */
  async cleanup?(): Promise<void>;

  /**
   * Returns the class name, typically used for debugging and identification.
   */
  get name(): string {
    return this.constructor.name;
  }
}
