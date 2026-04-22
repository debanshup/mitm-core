import type { ProxyEventMap } from "../event-manager/proxy-events/proxyEvents";
import type { BasePlugin } from "../plugin-manager/BasePlugin";

export type AbortMessage = {
  message: string;
  plugin: BasePlugin;
  event: keyof ProxyEventMap | string;
};

/**
 * Custom error signaled to stop the execution of a pipeline.
 * Used for intentional control flow interruptions rather than unexpected failures.
 * * @param message - Descriptive reason for the pipeline halt. Defaults to "Pipeline halted intentionally".
 */
export class PipelineAbortSignal extends Error {
  public readonly data?: AbortMessage;

  constructor(
    payload: AbortMessage | string = "Pipeline halted intentionally",
  ) {
    const message = typeof payload === "string" ? payload : payload.message;
    super(message);
    if (typeof payload !== "string") {
      this.data = payload;
    }
    this.name = "PipelineAbortSignal";
    
    // maintain proper stack trace
    Object.setPrototypeOf(this, PipelineAbortSignal.prototype);
  }
}
