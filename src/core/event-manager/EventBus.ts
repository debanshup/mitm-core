import EventEmitter from "events";

export class TypedEventEmitter<T extends object> extends EventEmitter {
  override on<K extends keyof T & (string | symbol)>(
    event: K,
    listener: T[K] extends any[] ? (...args: T[K]) => void : never,
  ): this {
    return super.on(event, listener as any);
  }
  override once<K extends keyof T & (string | symbol)>(
    event: K,
    listener: T[K] extends any[] ? (...args: T[K]) => void : never,
  ): this {
    return super.once(event, listener as any);
  }
  override off<K extends keyof T & (string | symbol)>(
    event: K,
    listener: T[K] extends any[] ? (...args: T[K]) => void : never,
  ): this {
    return super.off(event, listener as any);
  }

  override emit<K extends keyof T & (string | symbol)>(
    event: K,
    ...args: T[K] extends any[] ? T[K] : []
  ): boolean {
    return super.emit(event, ...args);
  }

  override listeners<K extends keyof T & (string | symbol)>(
    event: K,
  ): Array<T[K] extends any[] ? (...args: T[K]) => void : never> {
    return super.listeners(event as string | symbol) as Array<
      T[K] extends any[] ? (...args: T[K]) => void : never
    >;
  }

  override removeAllListeners(event?: keyof T & (string | symbol)): this {
    return super.removeAllListeners(event as string | symbol);
  }
}
