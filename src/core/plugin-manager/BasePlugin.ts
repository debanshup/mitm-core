import type { ProxyEventMap } from "../event-manager/proxy-events/proxyEvents";

/**
 * An abstract base class for implementing plugins that hook into the proxy event system.
 * Subclasses must specify the target event type and implement the `run` logic.
 *
 * @template K The event key from {@link ProxyEventMap}.
 */
export abstract class BasePlugin<K extends keyof ProxyEventMap = any> {
  /**
   * The specific proxy event this plugin listens to.
   */
  abstract readonly event: K;

  /**
   * Executes the plugin logic when the associated event is triggered.
   *
   * @param payload The event data payload, inferred from {@link ProxyEventMap}.
   */
  abstract run(
    payload: ProxyEventMap[K] extends any[] ? ProxyEventMap[K][0] : never,
  ): Promise<void> | void;

  /**
   * Returns the class name, typically used for debugging and identification.
   */
  get name(): string {
    return this.constructor.name;
  }
}
