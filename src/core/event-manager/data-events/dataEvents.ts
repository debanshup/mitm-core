import type { ProxyContext } from "../../types/types.ts";
import { TypedEventEmitter } from "../EventBus.ts";

interface DataEventMap {
  "DATA:RESPONSE": [payload: { ctx: ProxyContext }];
  "DATA:DECRYPTED_REQUEST": [payload: { ctx: ProxyContext }];
}

export const dataEvents = new TypedEventEmitter<DataEventMap>();
