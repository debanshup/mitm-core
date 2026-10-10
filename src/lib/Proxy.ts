import { registerGlobalConfig } from "../config.registry";
import * as http from "http";
import { connectionEvents } from "../core/event/connection-events/connectionEvents";
import {
  proxyEventManager,
  type ProxyEventMap,
} from "../core/event/proxy-events/proxyEvents";
import type { BasePlugin } from "../core/plugin/BasePlugin";
import { type RequestScope } from "../core/scope/types";
import { Middleware } from "../middleware/middleware";
import { connectionManager } from "../core/connection/ConnectionManager";
import { ContextManager } from "../core/scope/ContextManager";
import {
  pluginEventManager,
  type PluginEventMap,
} from "../core/event/plugin-events/pluginEvents";
import { TypedEventEmitter } from "../core/event/EventBus";

/**
 * Configuration options for the proxy server, controlling caching,
 * TLS certificate handling, default pipeline registration, and timeouts.
 */
export type ProxyConfig = {
  /**
   * Enables caching of generated TLS leaf certificates.
   *
   * @default true
   */
  useCertificateCache?: boolean;

  /**
   * Enables caching of proxy responses to improve performance.
   *
   * @default false
   */
  useResponseCache?: boolean;

  /**
   * Determines whether the default request and response processing
   * pipelines are registered.
   *
   * @default true
   */
  useDefaultPipelines?: boolean;

  /**
   * Root Certificate Authority (CA) credentials used to sign generated
   * TLS leaf certificates during HTTPS interception.
   *
   * The certificate and private key must be compatible CA credentials.
   */
  rootCa?: {
    /** CA private key, provided as a PEM string or Buffer. */
    key: string | Buffer;

    /** CA certificate, provided as a PEM string or Buffer. */
    cert: string | Buffer;
  };

  /**
   * Maximum time, in milliseconds, to wait for the client to complete
   * the TLS ClientHello.
   *
   * @default 10000
   */
  handshakeTimeoutMs?: number;

  /**
   * Maximum time, in milliseconds, allowed for an upstream operation
   * before the configured timeout is reached.
   *
   * @default 30000
   */
  upstreamTimeoutMs?: number;

  /**
   * Maximum time, in milliseconds, to wait for plugin execution to finish.
   * Set to 0 to disable the timeout completely.
   *
   * @default 10000
   */
  pluginTimeoutMs?: number;
};

/**
 * Configuration options for creating a Proxy instance.
 *
 * Extends the proxy configuration with an optional existing HTTP server
 * to which the proxy can attach.
 */
export type ProxyOptions = ProxyConfig & {
  /**
   * An existing HTTP server to attach the proxy to.
   *
   * If omitted, the proxy creates a new HTTP server.
   */
  server?: http.Server;
};

/**
 * Interface for the Proxy class, managing plugin execution,
 * HTTP server events, and lifecycle management.
 */
export interface IProxy {
  /**
   * Registers a plugin before the proxy starts.
   * Duplicate registration of the same plugin instance is ignored.
   *
   * @param plugin - Plugin to register.
   * @returns The current proxy instance for chaining.
   * @throws If the proxy is starting, running, or has been stopped.
   */
  use<K extends keyof PluginEventMap>(plugin: BasePlugin<K>): this;

  /**
   * Unregisters a plugin before the proxy starts.
   * Does nothing if the plugin is not registered.
   *
   * @param plugin - Plugin to unregister.
   * @returns The current proxy instance for chaining.
   * @throws If the proxy is starting, running, or has been stopped.
   */
  unuse(plugin: BasePlugin<any>): this;

  /**
   * Starts the proxy's HTTP server.
   *
   * @param port - Port to listen on. Use 0 to request an available port.
   * @param callback - Optional callback invoked after the server starts.
   * @returns A promise representing startup.
   */
  listen(port: number, callback?: () => void | Promise<void>): Promise<void>;

  /**
   * Gracefully shuts down the proxy, allowing active requests to drain
   * until the shutdown timeout expires before forcing cleanup.
   *
   * @param shutdownTimeoutMs - Maximum time to wait for active requests.
   * Defaults to 1500 ms.
   * @returns A promise that resolves when shutdown completes.
   */
  stop(shutdownTimeoutMs?: number): Promise<void>;
}

/**
 * The main proxy server implementation.
 */
export class Proxy extends TypedEventEmitter<ProxyEventMap> implements IProxy {
  private pluginListeners = new Map<
    BasePlugin<any>,
    (...args: any[]) => Promise<void>
  >();

  private httpServer: http.Server;

  private activePlugins = new Set<BasePlugin<any>>();
  private initializedPlugins: BasePlugin<any>[] = [];
  private isStarting = false;

  private config: Required<ProxyConfig>;

  private stopPromise?: Promise<void>;
  private shutdownHandlersCleanup?: () => void;

  private async initializePlugins(): Promise<void> {
    try {
      for (const plugin of this.activePlugins) {
        await plugin.init?.();

        // Track only after initialization succeeds.
        // Plugins without init() are valid too.
        this.initializedPlugins.push(plugin);
      }
    } catch (error) {
      const cleanupErrors = await this.cleanupInitializedPlugins();

      for (const cleanupError of cleanupErrors) {
        console.error("[Plugin Cleanup Error]", cleanupError);
      }

      throw error;
    }
  }

  private async cleanupInitializedPlugins(): Promise<Error[]> {
    const plugins = this.initializedPlugins.splice(0).reverse();
    const errors: Error[] = [];

    for (const plugin of plugins) {
      try {
        await plugin.cleanup?.();
      } catch (error) {
        const cleanupError =
          error instanceof Error ? error : new Error(String(error));

        errors.push(cleanupError);

        console.error(
          `[Plugin Cleanup Error] Plugin: ${plugin.name}`,
          cleanupError,
        );
      }
    }

    return errors;
  }

  private async stopInternal(shutdownTimeoutMs: number): Promise<void> {
    this.shutdownHandlersCleanup?.();
    // Stop accepting new connections immediately.
    const serverClosePromise = new Promise<void>((resolve, reject) => {
      this.httpServer!.close((err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });

    let drainInterval: NodeJS.Timeout | undefined;
    let shutdownTimer: NodeJS.Timeout | undefined;

    const drainPromise = new Promise<void>((resolve) => {
      if (ContextManager.getActiveRequests().length === 0) {
        resolve();
        return;
      }

      drainInterval = setInterval(() => {
        if (ContextManager.getActiveRequests().length === 0) {
          resolve();
        }
      }, 50);

      drainInterval.unref();
    });

    const timeoutPromise = new Promise<void>((resolve) => {
      shutdownTimer = setTimeout(() => {
        console.warn(
          `[Shutdown] Shutdown timeout of ${shutdownTimeoutMs}ms reached. ` +
            `Force-closing ${ContextManager.getActiveRequests().length} requests.`,
        );

        resolve();
      }, shutdownTimeoutMs);

      shutdownTimer.unref();
    });

    try {
      await Promise.race([drainPromise, timeoutPromise]);
    } finally {
      if (drainInterval) {
        clearInterval(drainInterval);
      }

      if (shutdownTimer) {
        clearTimeout(shutdownTimer);
      }
    }

    ContextManager.destroyActiveRequests();
    connectionManager.destroyAll();

    if (typeof this.httpServer.closeAllConnections === "function") {
      this.httpServer.closeAllConnections();
    }

    // Preserve the existing single-instance lifecycle behavior.
    connectionEvents.removeAllListeners();
    pluginEventManager.removeAllListeners();
    proxyEventManager.removeAllListeners();

    let shutdownError: unknown;

    try {
      await serverClosePromise;
    } catch (error) {
      shutdownError = error;
    }

    const cleanupErrors = await this.cleanupInitializedPlugins();

    console.info("[SERVER] Proxy stopped successfully.");

    if (shutdownError) {
      throw shutdownError;
    }

    if (cleanupErrors.length > 0) {
      throw new Error(
        `Proxy stopped, but ${cleanupErrors.length} plugin cleanup operation(s) failed.`,
      );
    }
  }

  private installShutdownHandlers(): void {
    if (this.shutdownHandlersCleanup) return;

    const cleanup = () => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      process.off("SIGHUP", onSighup);

      if (this.shutdownHandlersCleanup === cleanup) {
        this.shutdownHandlersCleanup = undefined;
      }
    };

    const shutdown = (signal: NodeJS.Signals) => {
      cleanup();

      void this.stop().catch((error: unknown) => {
        console.error(`[SERVER] Shutdown failed after ${signal}:`, error);
      });
    };

    const onSigint = () => shutdown("SIGINT");
    const onSigterm = () => shutdown("SIGTERM");
    const onSighup = () => shutdown("SIGHUP");

    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
    process.once("SIGHUP", onSighup);

    this.shutdownHandlersCleanup = cleanup;
  }

  override on<K extends keyof ProxyEventMap>(
    event: K,
    listener: ProxyEventMap[K] extends any[]
      ? (...args: ProxyEventMap[K]) => void | Promise<void>
      : never,
  ): this {
    proxyEventManager.on(event, listener as any);
    return this;
  }

  override once<K extends keyof ProxyEventMap>(
    event: K,
    listener: ProxyEventMap[K] extends any[]
      ? (...args: ProxyEventMap[K]) => void | Promise<void>
      : never,
  ): this {
    proxyEventManager.once(event, listener as any);
    return this;
  }

  override off<K extends keyof ProxyEventMap>(
    event: K,
    listener: ProxyEventMap[K] extends any[]
      ? (...args: ProxyEventMap[K]) => void | Promise<void>
      : never,
  ): this {
    proxyEventManager.off(event, listener as any);
    return this;
  }

  override addListener<K extends keyof ProxyEventMap>(
    event: K,
    listener: ProxyEventMap[K] extends any[]
      ? (...args: ProxyEventMap[K]) => void | Promise<void>
      : never,
  ): this {
    return this.on(event, listener);
  }

  override removeListener<K extends keyof ProxyEventMap>(
    event: K,
    listener: ProxyEventMap[K] extends any[]
      ? (...args: ProxyEventMap[K]) => void | Promise<void>
      : never,
  ): this {
    return this.off(event, listener);
  }

  override removeAllListeners(
    event?: keyof ProxyEventMap & (string | symbol),
  ): this {
    proxyEventManager.removeAllListeners(event);
    return this;
  }

  override listeners = proxyEventManager.listeners.bind(
    proxyEventManager,
  ) as any;

  /**
   * Creates and configures a proxy instance.
   *
   * Uses the provided HTTP server or creates a new one, applies the
   * configured defaults, initializes plugin event handling, registers
   * middleware pipelines, binds proxy events, and registers the global
   * proxy configuration.
   *
   * @param options - Configuration options for the proxy instance.
   *
   * @remarks
   * - Certificate caching is enabled by default.
   * - Response caching is disabled by default.
   * - Default processing pipelines are enabled by default.
   * - Handshake timeout defaults to 10 seconds.
   * - Upstream timeout defaults to 30 seconds.
   * - Plugin execution timeout defaults to 10 seconds.
   * - If no root CA credentials are provided, empty key and certificate
   *   values are used.
   *
   * @example
   * ```ts
   * const proxy = new Proxy({
   *   useResponseCache: true,
   *   handshakeTimeoutMs: 15_000,
   *   upstreamTimeoutMs: 45_000,
   * });
   * ```
   */
  constructor(options: ProxyOptions = {}) {
    super();

    this.httpServer = options.server || http.createServer({ keepAlive: true });
    this.config = {
      useCertificateCache: options.useCertificateCache ?? true,
      useResponseCache: options.useResponseCache ?? false,
      useDefaultPipelines: options.useDefaultPipelines ?? true,
      rootCa: options.rootCa || { key: "", cert: "" },
      handshakeTimeoutMs: options.handshakeTimeoutMs ?? 10_000,
      upstreamTimeoutMs: options.upstreamTimeoutMs ?? 30_000,
      pluginTimeoutMs: options.pluginTimeoutMs ?? 10_000,
    };

    pluginEventManager.setPluginTimeout(this.config.pluginTimeoutMs);

    // initialization
    Middleware.register({
      initializePipelines: this.config.useDefaultPipelines,
    });

    this.bindAllEvents();

    registerGlobalConfig(this.config);
  }

  private bindAllEvents() {
    this.httpServer.on("connection", async (socket) => {
      connectionManager.track(socket);
      await connectionEvents.emitAsync("TCP", {
        socket,
      });
    });

    this.httpServer.on("connect", async (req, socket, head) => {
      const scope: RequestScope = ContextManager.getOrCreateScope(socket);

      scope.request.client.req = req;

      connectionEvents.emit("CONNECT", {
        req,
        socket,
        head,
        scope,
      });
    });

    this.httpServer.on("request", async (req, res) => {
      const scope: RequestScope = ContextManager.getOrCreateScope(req.socket);
      scope.request.client.req = req;
      scope.request.client.res = res;

      await connectionEvents.emitAsync("HTTP:PLAIN", {
        req,
        res,
        scope,
      });
    });

    this.httpServer.on("upgrade", async (req, socket, head) => {
      const scope = ContextManager.getOrCreateScope(socket);
      await connectionEvents.emitAsync("WS:UPGRADE", {
        req,
        socket,
        scope,
        head,
      });
    });

    this.httpServer.on("error", (err: NodeJS.ErrnoException) => {
      // Startup errors are propagated by listen() through its one-time
      // error listener. Avoid logging them twice here.
      if (err.code === "EADDRINUSE" || err.code === "EACCES") {
        return;
      }

      // Node's EventEmitter throws when "error" is emitted without a listener.
      // Preserve the proxy's error event API without crashing when nobody
      // subscribes to it.
      if (proxyEventManager.listenerCount("error") > 0) {
        proxyEventManager.emit("error", err);
      }

      if (err.code === "EMFILE") {
        console.warn(
          "[SERVER_OS_WARN] Operating system file descriptor limit reached.",
        );
      } else if (proxyEventManager.listenerCount("error") === 0) {
        console.error("[Root HTTPServer Error Hook Captured]:", err.message);
      }
    });
  }

  public use<K extends keyof PluginEventMap>(plugin: BasePlugin<K>): this {
    if (this.isStarting || this.httpServer.listening || this.stopPromise) {
      throw new Error("Plugins must be registered before the proxy starts.");
    }

    if (this.activePlugins.has(plugin)) {
      return this;
    }

    const listener = async (...args: any[]) => {
      await plugin.run(args[0]);
    };

    this.activePlugins.add(plugin);
    this.pluginListeners.set(plugin, listener);

    pluginEventManager.on(plugin.event, listener as any);

    return this;
  }

  public unuse(plugin: BasePlugin<any>): this {
    if (this.isStarting || this.httpServer.listening || this.stopPromise) {
      throw new Error("Plugins cannot be unregistered after the proxy starts.");
    }
    const listener = this.pluginListeners.get(plugin);

    if (listener) {
      pluginEventManager.off(plugin.event, listener as any);
      this.pluginListeners.delete(plugin);
    }

    this.activePlugins.delete(plugin);

    return this;
  }

  public async listen(
    port: number,
    callback?: () => void | Promise<void>,
  ): Promise<void> {
    if (this.isStarting || this.httpServer.listening || this.stopPromise) {
      throw new Error("Proxy is already starting, running, or stopped.");
    }

    this.isStarting = true;

    try {
      await this.initializePlugins();

      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          this.httpServer.off("listening", onListening);
          reject(error);
        };

        const onListening = async () => {
          this.httpServer.off("error", onError);

          try {
            if (callback) {
              await callback();
            } else {
              console.info(
                "[SERVER] Started | Address:",
                this.httpServer.address(),
              );
            }

            resolve();
          } catch (error) {
            this.httpServer.close((closeError) => {
              if (closeError) {
                console.error(
                  "[SERVER] Failed to close after startup callback error:",
                  closeError,
                );
              }

              reject(error);
            });
          }
        };

        this.httpServer.once("error", onError);
        this.httpServer.once("listening", onListening);
        this.httpServer.listen(port);

        this.installShutdownHandlers();
      });
    } catch (error) {
      const cleanupErrors = await this.cleanupInitializedPlugins();

      for (const cleanupError of cleanupErrors) {
        console.error("[Plugin Cleanup Error During Startup]", cleanupError);
      }

      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  public stop(shutdownTimeoutMs = 1500): Promise<void> {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    if (!this.httpServer?.listening) {
      return Promise.resolve();
    }

    this.stopPromise = this.stopInternal(shutdownTimeoutMs);
    return this.stopPromise;
  }

  public address() {
    return this.httpServer.address();
  }
}
