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
 * SSL/TLS behavior, custom CA signing, and connection timeouts.
 */
export type ProxyConfig = {
  /** Enables caching of generated/forged TLS leaf certificates. */
  useCertificateCache?: boolean;

  /** Enables caching of proxy responses to improve performance. */
  useResponseCache?: boolean;

  /** If true, applies the default request/response processing pipelines. */
  useDefaultPipelines?: boolean;

  /**
   * The Root Certificate Authority (CA) used to dynamically sign forged leaf certificates.
   */
  rootCa?: {
    key: string | Buffer;
    cert: string | Buffer;
  };

  // /**
  //  * If false, the proxy will allow upstream connections to servers with invalid/self-signed certs.
  //  * @default true
  //  */
  // rejectUnauthorized?: boolean;

  /**
   * Maximum time (in ms) to wait for a client to complete the TLS ClientHello.
   * @default 10000
   */
  handshakeTimeoutMs?: number;
};

/**
 * Interface for the Proxy class, managing plugin execution,
 * HTTP server events, and lifecycle management.
 */
export interface IProxy {
  /**
   * Registers a plugin to its explicitly defined proxy event.
   */
  use<K extends keyof PluginEventMap>(plugin: BasePlugin<K>): this;

  /**
   * Unregisters a plugin.
   */
  unuse(plugin: BasePlugin<any>): this;

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

type ProxyOptions = {
  /** * An existing HTTP server to attach the proxy to.
   * If omitted, a new one is created.
   */
  server?: http.Server;

  /** * Maximum time (in milliseconds) to wait for plugins to finish.
   * Defaults to 5000ms. Set to 0 to disable the timeout completely.
   */
  pluginTimeoutMs?: number;
};

/**
 * The main proxy server implementation.
 */
export class Proxy extends TypedEventEmitter<ProxyEventMap> implements IProxy {
  private httpServer: http.Server;

  // plugins
  private activePlugins = new Set<BasePlugin<any>>();

  private config: Required<ProxyConfig>;

  //------------------- overrides ----------------------

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

  // ------------------------------------------------------------

  /**
   * Accepts an existing HTTP server (e.g., from Express),
   * or creates a new one if none is provided.
   */
  constructor(options: ProxyOptions & ProxyConfig = {}) {
    super();

    this.httpServer = options.server || http.createServer({ keepAlive: true });

    this.config = {
      useCertificateCache: options.useCertificateCache ?? true,
      useResponseCache: options.useResponseCache ?? false,
      useDefaultPipelines: options.useDefaultPipelines ?? true,
      rootCa: options.rootCa || { key: "", cert: "" },
      // rejectUnauthorized: options.rejectUnauthorized ?? true,
      handshakeTimeoutMs: options.handshakeTimeoutMs ?? 10000,
    };

    // initialization
    this.bindAllEvents();

    Middleware.register({
      initializePipelines: this.config.useDefaultPipelines,
    });
    registerGlobalConfig(this.config);
  }

  private bindAllEvents() {
    this.httpServer.on("connection", async (socket) => {
      connectionManager.track(socket);

      const scope: RequestScope = ContextManager.getOrCreateScope(socket);

      await connectionEvents.emitAsync("TCP", {
        socket,
        scope,
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

    this.httpServer.on("error", async (err: any) => {
      proxyEventManager.emit("error", err);

      if (err.code === "EADDRINUSE") {
        console.error(
          `[FATAL] Proxy server failed to bind: Port is already in use.`,
        );
        process.exit(1);
      }

      if (err.code === "EACCES") {
        console.error(
          `[FATAL] Permission Denied: Cannot bind proxy to this network port.`,
        );
        process.exit(1);
      }

      if (err.code === "EMFILE") {
        console.warn(
          `[SERVER_OS_WARN] Operating system file descriptor limit reached! Incoming connections are being throttled.`,
        );
      } else {
        console.error(
          `[Root HTTPServer Error Hook Captured]:`,
          err.message || err,
        );
      }
    });
  }

  public use<K extends keyof PluginEventMap>(plugin: BasePlugin<K>): this {
    this.activePlugins.add(plugin);

    pluginEventManager.on(plugin.event, (async (...args: any[]) => {
      // console.info(":args:", JSON.stringify(args[0]));
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
  public unuse(plugin: BasePlugin<any>): this {
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
    if (!this.httpServer || !this.httpServer.listening)
      return Promise.resolve();
    // force close all active and idle sockets
    if ("closeAllConnections" in this.httpServer) {
      this.httpServer.closeAllConnections();
    }

    return new Promise((resolve, reject) => {
      connectionManager.destroyAll();
      this.httpServer!.close((err) => {
        if (err) {
          console.error(err);
          return reject(err);
        } else {
          return resolve();
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
