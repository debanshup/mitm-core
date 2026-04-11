export class PipelineAbortSignal extends Error {
  constructor(message: string = "Pipeline halted intentionally") {
    super(message);
    this.name = "PipelineAbortSignal";
  }
}
