import type { Socket } from "net";
import type Stream from "stream";
import type { ProxyContext } from "../types/types.ts";

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
        socket,
        state: new Map(),
      });
    }
    return this.contextStore.get(socket)!;
  }
}
