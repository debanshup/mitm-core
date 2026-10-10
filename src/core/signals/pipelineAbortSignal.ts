import type { AbortMessage } from "./types";

/**
 * Error used to intentionally stop pipeline execution.
 *
 * Distinguishes deliberate pipeline interruption from unexpected errors.
 * The signal can carry optional metadata identifying the reason, plugin,
 * and event associated with the interruption.
 *
 * @example
 * ```ts
 * throw new PipelineAbortSignal("Request blocked by policy");
 * ```
 *
 * @example
 * ```ts
 * throw new PipelineAbortSignal({
 *   message: "Request blocked by plugin",
 *   plugin,
 *   event: "http:request",
 * });
 * ```
 */
export class PipelineAbortSignal extends Error {
  /**
   * Optional metadata describing the pipeline abort.
   *
   * Undefined when the signal is constructed with a string message.
   */
  public readonly data?: AbortMessage;

  /**
   * Creates a pipeline-abort signal.
   *
   * When given a string, it is used as the error message.
   * When given an {@link AbortMessage}, its `message` becomes the error
   * message and the complete payload is exposed through {@link data}.
   *
   * @param payload - Abort reason as a string or structured metadata.
   *                  Defaults to `"Pipeline halted intentionally"`.
   */
  constructor(
    payload: AbortMessage | string = "Pipeline halted intentionally",
  ) {
    const message = typeof payload === "string" ? payload : payload.message;
    super(message);
    if (typeof payload !== "string") {
      this.data = payload;
    }
    this.name = "PipelineAbortSignal";

    Error.captureStackTrace(this, this.constructor);

    // maintain proper stack trace
    Object.setPrototypeOf(this, PipelineAbortSignal.prototype);
  }
}
