/**
 * @experimental : will be used later if needed
 */

import type { ProxyContext } from "../../context-manager/ContextManager.ts";
import { TypedEventEmitter } from "../EventBus.ts";

export interface PipelineEventMap {
  PAUSE: [payload: { ctx: ProxyContext }];
  RESUME: [payload: { ctx: ProxyContext }];
  STOP: [payload: { ctx: ProxyContext }];
}

export const pipelineEvents = new TypedEventEmitter<PipelineEventMap>();
