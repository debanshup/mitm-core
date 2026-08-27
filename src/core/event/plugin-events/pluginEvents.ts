// src/core/event-manager/handler-events/handlerEvents.ts

import { TypedEventEmitter } from "../EventBus";
import type { RequestScope } from "../../scope/types";
import { PipelineAbortSignal } from "../../signals/pipelineAbortSignal";

export interface WsMessageContext {
  data: Buffer;
  isBinary: boolean;
  drop: boolean;
}

export interface PluginEventMap {
  // Layer 1
  "proxy:client-connect": [payload: { scope: RequestScope }];
  "proxy:client-before-handshake": [payload: { scope: RequestScope }];
  "proxy:client-after-handshake": [payload: { scope: RequestScope }];
  "proxy:client-http-request": [payload: { scope: RequestScope }];
  "proxy:client-https-request": [payload: { scope: RequestScope }];
  "proxy:client-upgrade": [payload: { scope: RequestScope }];

  // Layer 2
  "proxy:upstream-dispatch": [payload: { scope: RequestScope }];
  "proxy:upstream-connect": [payload: { scope: RequestScope }];
  "proxy:upstream-request": [payload: { scope: RequestScope }];

  // Layer 3
  "proxy:target-response": [payload: { scope: RequestScope }];
  "proxy:target-error": [payload: { scope: RequestScope }];
  "proxy:client-disconnect": [payload: { scope: RequestScope }];

  // Updated Layer 3 WebSocket Events
  "proxy:ws-client-message": [
    payload: { scope: RequestScope; messageContext: WsMessageContext },
  ];
  "proxy:ws-upstream-message": [
    payload: { scope: RequestScope; messageContext: WsMessageContext },
  ];
}

/**
 * Global singleton for emitting handler events with built-in timeout.
 * Accessible from anywhere: Handlers, Middleware, Proxy, etc.
 */

export class PluginEventManager extends TypedEventEmitter<PluginEventMap> {
  private pluginTimeoutMs: number = 5000;

  setPluginTimeout(ms: number): void {
    this.pluginTimeoutMs = ms;
  }

  override async emitAsync<K extends keyof PluginEventMap>(
    eventName: K,
    ...args: PluginEventMap[K] extends any[] ? PluginEventMap[K] : never[]
  ): Promise<void> {
    const listeners = this.listeners(eventName);
    if (listeners.length === 0) return;

    for (const listener of listeners) {
      const fn = listener as (...args: any[]) => void | Promise<void>;

      if (this.pluginTimeoutMs <= 0) {
        await Promise.resolve(fn(...args));
        continue;
      }

      let timerId: NodeJS.Timeout | undefined;

      // 1. Initialize the plugin promise
      const pluginExecution = Promise.resolve(fn(...args));

      // 2. CRITICAL: Attach a "dummy" catch.
      // If the timeout wins the race, but the plugin throws an error 10 seconds later,
      // Node.js will crash with an UnhandledPromiseRejection unless this dummy catch exists.
      pluginExecution.catch(() => {});

      const timeoutTimer = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          reject(new Error("PLUGIN_TIMEOUT"));
        }, this.pluginTimeoutMs);
      });

      try {
        // 3. Race them!
        await Promise.race([pluginExecution, timeoutTimer]);
      } catch (error: any) {
        if (
          error instanceof PipelineAbortSignal ||
          error?.constructor?.name === "PipelineAbortSignal"
        ) {
          throw error; // Pass it up to the HandshakeHandler/PipelineCompiler cleanly
        }

        if (error.message === "PLUGIN_TIMEOUT") {
          console.error(
            `[PLUGIN_TIMEOUT_ABORT] Event: ${String(eventName)}, Execution exceeded limit of: ${this.pluginTimeoutMs}ms`,
          );
          throw error;
        }

        console.error(
          `[Plugin Internal Error] Event: ${String(eventName)} |`,
          error,
        );
        throw error;
      } finally {
        if (timerId) clearTimeout(timerId);
      }
    }
  }
}

export const pluginEventManager = new PluginEventManager();
