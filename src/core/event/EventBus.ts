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
   * Executes all asynchronous listeners for an event concurrently in parallel.
   * Awaits completion of all listeners. Guarantees that a failure in one
   * listener does not abort or interrupt the execution of other listeners.
   */
  async emitAsync<K extends keyof T>(
    eventName: K,
    ...args: T[K] extends any[] ? T[K] : never[]
  ): Promise<void> {
    const listeners = this.listeners(
      eventName as (keyof T & (string | symbol)) | any,
    );

    if (listeners.length === 0) return;

    // 1. Execute all listeners concurrently and wait for ALL to settle (resolve or reject)
    const results = await Promise.allSettled(
      listeners.map((listener) => {
        const fn = listener as (...args: any[]) => void | Promise<void>;
        return Promise.resolve(fn(...args));
      }),
    );

    // 2. Aggregate any errors that occurred during execution
    const errors: any[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        errors.push(result.reason);
      }
    }

    // 3. If any listener failed, throw a collective error so your outer try/catch blocks notice it
    if (errors.length > 0) {
      if (errors.length === 1) {
        throw errors[0]; // Throw the single error directly to keep clean stack traces
      }

      // Combine multiple errors if more than one listener broke down
      const combinedMessage = errors
        .map((e, i) => `[Listener ${i + 1}]: ${e?.message || e}`)
        .join("; ");
      throw new Error(
        `[Aggregate Event Error] "${String(eventName)}" failed: ${combinedMessage}`,
      );
    }
  }
}
