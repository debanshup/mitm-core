/**
 * @experimental : will be used later if needed
 */

import type { ProxyContext } from "../../../types/types.ts";
import { TypedEventEmitter } from "../EventBus.ts";

interface PipelineEventMap {
  PAUSE: [payload: { ctx: ProxyContext }];
  RESUME: [payload: { ctx: ProxyContext }];
  STOP: [payload: { ctx: ProxyContext }];
}

export const pipelineEvents = new TypedEventEmitter<PipelineEventMap>();
