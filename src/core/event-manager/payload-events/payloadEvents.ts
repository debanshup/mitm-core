import type { ProxyContext } from "../../context-manager/ContextManager";
import { TypedEventEmitter } from "../EventBus";

export interface PayloadEventMap {
  "PAYLOAD:REQUEST": [payload: { ctx: ProxyContext }];
  "PAYLOAD:RESPONSE": [payload: { ctx: ProxyContext }];
}

export const payloadEvents = new TypedEventEmitter<PayloadEventMap>();
export type PayloadEvents = typeof payloadEvents;
