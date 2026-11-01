import type { AbortMessage } from "./types";

/**
 * Error used to intentionally terminate the current pipeline execution.
 *
 * Use this signal when processing must stop without transferring
 * request ownership to another handler.
 *
 * Throwing this signal:
 * - Stops the current pipeline execution.
 * - Does not transfer request ownership.
 * - Does not automatically destroy the client or upstream connection.
 * - Does not automatically generate an HTTP response.
 *
 * The component handling the abort is responsible for performing
 * any required request, response, or connection cleanup.
 *
 * @example
 * // Stop processing because the request violates a policy.
 * throw new PipelineAbortSignal("Request blocked by policy");
 *
 * @example
 * // Stop processing with additional metadata.
 * throw new PipelineAbortSignal({
 *   message: "Request blocked by plugin",
 *   plugin,
 *   event: "http:request",
 * });
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
    const cause = typeof payload === "string" ? undefined : payload.cause;
    super(message, cause === undefined ? undefined : { cause });
    if (typeof payload !== "string") {
      this.data = payload;
    }
    this.name = "PipelineAbortSignal";

    Error.captureStackTrace(this, this.constructor);

    // maintain proper stack trace
    Object.setPrototypeOf(this, PipelineAbortSignal.prototype);
  }
}
