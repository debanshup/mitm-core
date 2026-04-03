import EventEmitter from "events";
// export const connectionEvents = new EventEmitter();

// export const ConnectionTypes = {
//     TCP:"tcp",
//     HTTP : "http",
//     CONNECT : "connect",
//     DECRYPTED_HTTP :"decrypted_http"
// }



export class TypedEventEmitter<T extends object> extends EventEmitter {
  
  override on<K extends keyof T & (string | symbol)>(
    event: K,
    listener: T[K] extends any[] ? (...args: T[K]) => void : never
  ): this {
    return super.on(event, listener as any);
  }

  override emit<K extends keyof T & (string | symbol)>(
    event: K,
    ...args: T[K] extends any[] ? T[K] : []
  ): boolean {
    return super.emit(event, ...args);
  }

  override removeAllListeners(event?: keyof T & (string | symbol)): this {
    return super.removeAllListeners(event as string | symbol);
  }
}