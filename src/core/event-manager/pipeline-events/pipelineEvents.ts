/**
 * @experimental : will be used later if needed
 */

import type {
  RequestScope,
} from "../../context-manager/types";
import { TypedEventEmitter } from "../EventBus";

export interface PipelineEventMap {
  PAUSE: [payload: { scope: RequestScope }];
  RESUME: [payload: { scope: RequestScope }];
  STOP: [payload: { scope: RequestScope }];
}

export const pipelineEvents = new TypedEventEmitter<PipelineEventMap>();
