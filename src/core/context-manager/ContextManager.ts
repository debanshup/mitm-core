import type { Socket } from "net";
import type Stream from "stream";
import type { ProxyContext } from "../types/types.ts";
import crypto from "crypto";
export class ContextManager {
  private static contextStore = new WeakMap<
    Stream.Duplex | Socket,
    ProxyContext
  >();
  public static setContext(socket: Stream.Duplex, context: ProxyContext) {
    this.contextStore.set(socket, context);
  }
  public static getContext(socket: Stream.Duplex) {
    if (!this.contextStore.has(socket)) {
      this.contextStore.set(socket, {
        id: crypto.randomUUID(),
        // socket,
        conn_state: new Map(),
        reqCtx: {
          id: crypto.randomUUID(),
          state: new Map(),
        },
      });
    }
    return this.contextStore.get(socket)!;
  }

  public static getCtxByID(id: string){
    
  }
}
