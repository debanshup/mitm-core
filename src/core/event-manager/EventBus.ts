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

  /**
   * Safely executes all asynchronous listeners for an event in parallel.
   * If any listener rejects, the promise chain halts and throws the error.
   */
  async emitAsync<K extends keyof T>(
    eventName: K,
    ...args: T[K] extends any[] ? T[K] : never[]
  ): Promise<void> {
    const listeners = this.listeners(
      eventName as (keyof T & (string | symbol)) | any,
    );

    if (listeners.length === 0) return;

    // Execute listeners sequentially, NOT in parallel!
    for (const listener of listeners) {
      const fn = listener as (...args: any[]) => void | Promise<void>;

      // Wait for this specific plugin to finish completely
      // before letting the next plugin touch the socket.
      await fn(...args);
    }
  }
}
