export type PipelineOutcome =
  | { type: "continue" }
  | { type: "hijacked"; owner: string }
  | { type: "aborted"; reason: string; cause?: unknown }
  | { type: "failed"; reason: string; cause?: unknown };
