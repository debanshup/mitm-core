import * as http from "http";
import { connectionEvents } from "./event-manager/connection-events/connectionEvents";
import { TypedEventEmitter } from "./event-manager/EventBus";
import type { ProxyEventMap } from "./event-manager/proxy-events/proxyEvents";
import type { BasePlugin } from "./plugin-manager/BasePlugin";
import { payloadEvents } from "./event-manager/payload-events/payloadEvents";
import { ContextManager } from "./context-manager/ContextManager";
import { Middleware } from "../middleware/middleware";
import type { Socket } from "net";

/**
 * Interface for the Proxy class, managing plugin execution,
 * HTTP server events, and lifecycle management.
 */
export interface IProxy {
  /**
   * Registers a plugin to its explicitly defined proxy event.
   */
  use<K extends keyof ProxyEventMap>(plugin: BasePlugin<K>): this;

  /**
   * Unregisters a plugin.
   */
  unuse(plugin: BasePlugin): this;

  /**
   * Starts the HTTP server on the specified port.
   * @param port - The network port to listen on.
   * @param callback - Optional sync or async function to execute once the server is ready.
   */
  listen(port: number, callback?: () => void | Promise<void>): void;

  /**
   * Gracefully shuts down the server and forcibly closes all active and idle connections.
   * @returns A promise that resolves when the server has successfully closed.
   */
  stop(): Promise<void>;
}

/**
 * Configuration options for the Proxy instance.
 */

interface ProxyOptions {
  /** * An existing HTTP server to attach the proxy to.
   * If omitted, a new one is created.
   */
  server?: http.Server;

  /** * Maximum time (in milliseconds) to wait for plugins to finish.
   * Defaults to 5000ms. Set to 0 to disable the timeout completely.
   */
  pluginTimeoutMs?: number;
}

/**
 * The main proxy server implementation.
 */
export class Proxy extends TypedEventEmitter<ProxyEventMap> implements IProxy {
  /**
   * @private
   */
  // timeout for plugn execution
  private pluginTimeoutMs: number;
  private httpServer: http.Server;

  // plugins
  private activePlugins = new Set<BasePlugin>();

  /**
   * @critical
   * Safely executes plugins with an enforced timeout.
   */
  private async executePluginsWithTimeout<K extends keyof ProxyEventMap>(
    eventName: K,
    ...args: ProxyEventMap[K] // caller is strictly typed here!
  ): Promise<void> {
    const pluginExecution = this.emitAsync(eventName, ...(args as any)); // used `as any` strictly on the spread to bypass TS's generic tuple limitation

    if (this.pluginTimeoutMs <= 0) {
      await pluginExecution;
      return;
    }

    let timerId: NodeJS.Timeout;
    const timeoutTimer = new Promise<never>((_, reject) => {
      timerId = setTimeout(
        () => reject(new Error("PLUGIN_TIMEOUT")),
        this.pluginTimeoutMs,
      );
    });

    try {
      await Promise.race([pluginExecution, timeoutTimer]);
    } finally {
      clearTimeout(timerId!);
    }
  }

  private bindAllEvents() {
    this.httpServer.on("connection", async (socket) => {
      await this.executePluginsWithTimeout("tcp:connection", { socket });
      const ctx = ContextManager.getContext(socket);
      connectionEvents?.emitAsync("TCP", { socket, ctx });
    });

    this.httpServer.on("connect", async (req, socket, head) => {
      await this.executePluginsWithTimeout("tunnel:connect", {
        req,
        socket,
        head: head as Buffer,
        payloadEvent: payloadEvents,
      });
      const ctx = ContextManager.getContext(req.socket);
      connectionEvents?.emitAsync("CONNECT", { req, socket, head, ctx });
    });
    this.httpServer.on("request", async (req, res) => {
      await this.executePluginsWithTimeout("http:plain_request", {
        req,
        res,
      });
      const ctx = ContextManager.getContext(req.socket);
      connectionEvents?.emitAsync("HTTP:PLAIN", { req, res, ctx });
    });

    // bind server error
    this.httpServer.on("error", async (err) => {
      await this.executePluginsWithTimeout("error", err);
    });

    // other events (inner)

    connectionEvents?.on("CONNECT:PRE_ESTABLISH", async ({ ctx, socket }) => {
      await this.executePluginsWithTimeout("tunnel:pre_establish", {
        socket,
        ctx: ctx || ContextManager.getContext(socket),
      });
    });
    connectionEvents?.on("CONNECT:ESTABLISHED", async ({ ctx, socket }) => {
      await this.executePluginsWithTimeout("tunnel:established", {
        socket,
        ctx: ctx || ContextManager.getContext(socket),
      });
    });

    payloadEvents?.on("PAYLOAD:REQUEST", async ({ ctx }) => {
      await this.executePluginsWithTimeout("http:decrypted_request", { ctx });
    });
    payloadEvents?.on("PAYLOAD:RESPONSE", async ({ ctx }) => {
      await this.executePluginsWithTimeout("decrypted_response", { ctx });
    });
  }

  /**
   * Accepts an existing HTTP server (e.g., from Express),
   * or creates a new one if none is provided.
   */
  constructor(options: ProxyOptions = {}) {
    super();
    // initialize plugin timeout
    this.pluginTimeoutMs = options.pluginTimeoutMs ?? 5000;
    // initialize server
    this.httpServer = options.server || http.createServer({ keepAlive: true });
    // bind all events
    this.bindAllEvents();
    // initialize middleware
    Middleware.register({ initializePipelines: true });
  }

  public use<K extends keyof ProxyEventMap>(plugin: BasePlugin<K>): this {
    this.activePlugins.add(plugin);

    this.on(plugin.event, (async (...args: any[]) => {
      // first argument is always the payload object
      await plugin.run(args[0]);
    }) as any);

    console.debug(
      `[REGISTRY] Registered: ${plugin.name} | event: (${plugin.event})`,
    );
    return this;
  }
  /**
   * Removes a plugin from the active tracking set.
   * * @experimental This method is a partial implementation and may change in future versions.
   * @param plugin - The plugin instance to deactivate.
   * @limitations This does **not** automatically detach event listeners.
   * Manual cleanup via `this.off()` is required to prevent ghost executions.
   */
  public unuse(plugin: BasePlugin): this {
    this.activePlugins.delete(plugin);
    return this;
  }

  /**
   * Starts the HTTP server on the specified port.
   * @param port - The port number to listen on.
   * @param callback - Optional function to execute once the server starts. Defaults to logging the server address if omitted.
   */
  public listen(port: number, callback?: () => void | Promise<void>) {
    if (this.httpServer) {
      this.httpServer.listen(port, async () => {
        if (callback) {
          await callback();
        } else {
          console.info(
            `[SERVER] Started | Address:`,
            this.httpServer?.address(),
          );
        }
      });
    }
  }

  /**
   * Stops the HTTP server and forcibly closes all active connections.
   * @returns A promise that resolves when the server is successfully closed, or rejects if an error occurs.
   */
  public stop(): Promise<void> {
    if (!this.httpServer || !this.httpServer.listening) Promise.resolve();
    // force close all active and idle sockets
    if ("closeAllConnections" in this.httpServer) {
      this.httpServer.closeAllConnections();
    }

    return new Promise((resolve, reject) => {
      this.httpServer!.close((err) => {
        if (err) {
          console.error(err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

process.on("uncaughtException", (err) => {
  console.error(`[FATAL_EXCEPTION]`, err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[UNHANDLED_REJECTION]`, reason);
});
