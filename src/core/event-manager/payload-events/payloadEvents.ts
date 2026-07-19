import type {
  RequestScope,
} from "../../context-manager/types";
import { TypedEventEmitter } from "../EventBus";

export interface PayloadEventMap {
  "PAYLOAD:REQUEST": [payload: { scope: RequestScope }];
  "PAYLOAD:RESPONSE": [payload: { scope: RequestScope }];
}

export const payloadEvents = new TypedEventEmitter<PayloadEventMap>();
export type PayloadEvents = typeof payloadEvents;
