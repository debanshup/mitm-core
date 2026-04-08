import type { ProxyContext } from "../../../types/types.ts";
import { TypedEventEmitter } from "../EventBus.ts";

export interface PayloadEventMap {
  "PAYLOAD:REQUEST": [payload: { ctx: ProxyContext }];
  "PAYLOAD:RESPONSE": [payload: { ctx: ProxyContext }];
}

export const payloadEvents = new TypedEventEmitter<PayloadEventMap>();
