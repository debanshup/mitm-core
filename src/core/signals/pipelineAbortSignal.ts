/**
 * Custom error signaled to stop the execution of a pipeline.
 * Used for intentional control flow interruptions rather than unexpected failures.
 * * @param message - Descriptive reason for the pipeline halt. Defaults to "Pipeline halted intentionally".
 */
export class PipelineAbortSignal extends Error {
  constructor(message: string = "Pipeline halted intentionally") {
    super(message);
    this.name = "PipelineAbortSignal";
  }
}
