import EventEmitter from "events";

/**
 * A type-safe wrapper around Node.js EventEmitter.
 *
 * Associates event names with argument tuples through a generic event map,
 * allowing TypeScript to validate listener parameters and emitted arguments.
 *
 * Extends Node.js EventEmitter and retains its standard event-handling
 * behavior while adding typed interfaces for common listener operations.
 *
 * @typeParam T - An event map whose keys identify events and whose values
 *                define the argument tuples accepted by those events.
 *
 * @internal
 */
export class TypedEventEmitter<T extends object> extends EventEmitter {
  /**
   * Registers a listener for the specified event.
   *
   * The listener's parameters are inferred from the argument tuple
   * associated with the event in the event map.
   *
   * @typeParam K - The event key.
   * @param event - The event to listen for.
   * @param listener - The callback invoked when the event is emitted.
   * @returns This emitter instance for method chaining.
   */
  override on<K extends keyof T & (string | symbol)>(
    event: K,
    listener: T[K] extends any[] ? (...args: T[K]) => void : never,
  ): this {
    return super.on(event, listener as any);
  }

  /**
   * Registers a listener that is invoked at most once for the specified event.
   *
   * The listener's parameters are inferred from the event's argument tuple.
   *
   * @typeParam K - The event key.
   * @param event - The event to listen for.
   * @param listener - The callback invoked the first time the event is emitted.
   * @returns This emitter instance for method chaining.
   */
  override once<K extends keyof T & (string | symbol)>(
    event: K,
    listener: T[K] extends any[] ? (...args: T[K]) => void : never,
  ): this {
    return super.once(event, listener as any);
  }

  /**
   * Removes a previously registered listener for the specified event.
   *
   * The listener must match the callback registered with the emitter.
   *
   * @typeParam K - The event key.
   * @param event - The event from which to remove the listener.
   * @param listener - The listener callback to remove.
   * @returns This emitter instance for method chaining.
   */
  override off<K extends keyof T & (string | symbol)>(
    event: K,
    listener: T[K] extends any[] ? (...args: T[K]) => void : never,
  ): this {
    return super.off(event, listener as any);
  }

  /**
   * Emits the specified event synchronously.
   *
   * Registered listeners are invoked according to Node.js EventEmitter
   * semantics. This method does not wait for promises returned by listeners.
   *
   * @typeParam K - The event key.
   * @param event - The event to emit.
   * @param args - Arguments associated with the event.
   * @returns `true` if the event had listeners, otherwise `false`.
   */
  override emit<K extends keyof T & (string | symbol)>(
    event: K,
    ...args: T[K] extends any[] ? T[K] : []
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Returns the registered listeners for the specified event.
   *
   * The returned callbacks are typed according to the event's argument tuple.
   *
   * @typeParam K - The event key.
   * @param event - The event whose listeners should be retrieved.
   * @returns An array of listener callbacks.
   */
  override listeners<K extends keyof T & (string | symbol)>(
    event: K,
  ): Array<T[K] extends any[] ? (...args: T[K]) => void : never> {
    return super.listeners(event as string | symbol) as Array<
      T[K] extends any[] ? (...args: T[K]) => void : never
    >;
  }

  /**
   * Removes all listeners for the specified event, or all events when
   * no event is provided.
   *
   * @param event - The event whose listeners should be removed.
   *               If omitted, listeners for all events are removed.
   * @returns This emitter instance for method chaining.
   */
  override removeAllListeners(event?: keyof T & (string | symbol)): this {
    if (event === undefined) {
      super.removeAllListeners();
      return this;
    }

    super.removeAllListeners(event);
    return this;
  }

  /**
   * Executes all listeners for an event concurrently and asynchronously.
   *
   * Each listener is invoked, and its return value is normalized to a
   * promise. This method waits for all listener promises to settle before
   * completing, even if one or more listeners reject.
   *
   * If no listeners are registered, the method resolves immediately.
   *
   * If a single listener rejects, its rejection reason is thrown directly.
   * If multiple listeners reject, an aggregate error is thrown containing
   * their error messages.
   *
   * @typeParam K - The event key.
   * @param eventName - The event to emit.
   * @param args - Arguments associated with the event.
   * @returns A promise that resolves when all listeners succeed.
   * @throws The rejection reason when one listener fails, or an aggregate
   *         error when multiple listeners fail.
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
