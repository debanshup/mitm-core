import type { ProxyEventMap } from "../event/proxy-events/proxyEvents";
import type { BasePlugin } from "../plugin/BasePlugin";

export type AbortReason = "policy" | "plugin" | "user" | "internal";

/**
 * Describes the context associated with an intentional pipeline abort.
 *
 * Provides a human-readable reason, the plugin responsible for the abort,
 * and the event being processed when the abort was requested.
 */

export type AbortMessage = {
  /** Human-readable explanation for stopping pipeline execution. */
  message: string;

  /** Category of the abort request. */
  reason?: AbortReason;

  /**
   * Plugin associated with the abort request.
   */
  plugin?: BasePlugin<any> | undefined;

  /**
   * Event associated with the pipeline abort.
   */
  event?: keyof ProxyEventMap | string | undefined;

  /** Captured error context or lower-level exception metadata. */
  cause?: unknown;
};
