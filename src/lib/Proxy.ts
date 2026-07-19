import { registerGlobalConfig } from "../config.registry";
import * as http from "http";
import { connectionEvents } from "../core/event-manager/connection-events/connectionEvents";
import { TypedEventEmitter } from "../core/event-manager/EventBus";
import type { ProxyEventMap } from "../core/event-manager/proxy-events/proxyEvents";
import type { BasePlugin } from "../core/plugin-manager/BasePlugin";
import { payloadEvents } from "../core/event-manager/payload-events/payloadEvents";
import { type RequestScope } from "../core/context-manager/types";
import { Middleware } from "../middleware/middleware";
import { connectionManager } from "../core/connection-manager/ConnectionManager";
import { ContextManager } from "../core/context-manager/ContextManager";

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
  /**
   * @private
   */
  // timeout for plugn execution
  private pluginTimeoutMs: number;
  private httpServer: http.Server;

  // plugins
  private activePlugins = new Set<BasePlugin>();

  private config: Required<ProxyConfig>;

  /**
   * Accepts an existing HTTP server (e.g., from Express),
   * or creates a new one if none is provided.
   */
  constructor(options: ProxyOptions & ProxyConfig = {}) {
    super();
    this.pluginTimeoutMs = options.pluginTimeoutMs ?? 5000;
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
      connectionManager.track(socket);

      await this.executePluginsWithTimeout("tcp:connection", { socket });

      const sessionContext = ContextManager.getOrCreateSessionContext(socket);
      const requestContext =
        ContextManager.getOrCreateRequestContext(sessionContext);
      const lifecycle = ContextManager.getOrCreateRequestLifeCycle(
        requestContext.requestId,
      );

      const scope: RequestScope = { sessionContext, requestContext, lifecycle };

      connectionEvents.emit("TCP", {
        socket,
        scope,
      });
    });

    this.httpServer.on("connect", async (req, socket, head) => {
      const sessionContext = ContextManager.getOrCreateSessionContext(socket);

      // proxyContext.socket = socket

      const requestContext = ContextManager.getOrCreateRequestContext(
        sessionContext,
        req,
      );
      const lifecycle = ContextManager.getOrCreateRequestLifeCycle(
        requestContext.requestId,
      );

      requestContext.req = req;

      const scope: RequestScope = {
        sessionContext,
        requestContext,
        lifecycle,
      };

      await this.executePluginsWithTimeout("tunnel:connect", {
        scope,
        req,
        socket,
        head: head as Buffer,
        payloadEvent: payloadEvents,
      });

      connectionEvents.emit("CONNECT", {
        req,
        socket,
        head,
        scope,
      });
    });

    this.httpServer.on("request", async (req, res) => {
      await this.executePluginsWithTimeout("http:plain_request", {
        req,
        res,
      });

      const sessionContext = ContextManager.getOrCreateSessionContext(
        req.socket,
      );
      // const oldRequestContext = ContextManager
      const requestContext =
        ContextManager.getOrCreateRequestContext(sessionContext);
      const lifecycle = ContextManager.getOrCreateRequestLifeCycle(
        requestContext.requestId,
      );

      requestContext.req = req;
      requestContext.res = res;

      const scope: RequestScope = {
        sessionContext,
        requestContext,
        lifecycle,
      };

      connectionEvents.emit("HTTP:PLAIN", {
        req,
        res,
        scope,
      });
    });

    this.httpServer.on("error", async (err) => {
      await this.executePluginsWithTimeout("error", err);
    });

    // internal events

    connectionEvents.on("CONNECT:PRE_ESTABLISH", async ({ scope, socket }) => {
      await this.executePluginsWithTimeout("tunnel:pre_establish", {
        socket,
        scope,
      });
    });

    connectionEvents.on("CONNECT:ESTABLISHED", async ({ scope, socket }) => {
      await this.executePluginsWithTimeout("tunnel:established", {
        socket,
        scope,
      });
    });

    payloadEvents.on("PAYLOAD:REQUEST", async ({ scope }) => {
      await this.executePluginsWithTimeout("http:decrypted_request", { scope });
    });

    payloadEvents.on("PAYLOAD:RESPONSE", async ({ scope }) => {
      await this.executePluginsWithTimeout("decrypted_response", { scope });
    });
  }

  public use<K extends keyof ProxyEventMap>(plugin: BasePlugin<K>): this {
    this.activePlugins.add(plugin);

    this.on(plugin.event, (async (...args: any[]) => {
      // first argument is always the payload object

      // 1. Extract the exact type of args[0] from the plugin.run method
      type ArgsZero<T> = T extends {
        run: (arg: infer P, ...args: any[]) => any;
      }
        ? P
        : never;

      type TargetPayload = ArgsZero<typeof plugin>;

      // 2. Map and display all its keys and their respective types
      type InspectPayload<T> = {
        [K in keyof T]: T[K];
      };

      type Result = InspectPayload<TargetPayload>;

      // console.info(args[0])

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
