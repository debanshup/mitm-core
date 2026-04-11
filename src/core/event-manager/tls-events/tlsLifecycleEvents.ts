import type { ProxyContext } from "../../../types/types.ts";
import { TypedEventEmitter } from "../EventBus.ts";

export interface TlsLifecycleEventMap {
  "TLS:SERVER_CREATED": [payload: { ctx: ProxyContext }];
  "TLS:LEAF_GENERATED": [payload: { ctx: ProxyContext }];
}

// 2. Export the well-named instance
export const tlsLifecycleEvents = new TypedEventEmitter<TlsLifecycleEventMap>();
