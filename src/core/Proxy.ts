await import("../middleware/middleware.ts");
import * as http from "http";
import Stream from "stream";
import { Socket } from "net";
import { PluginRegistry } from "../plugins/PluginRegistry.ts";
import { connectionEvents } from "./event-manager/connection-events/connectionEvents.ts";
import type {
  ProxyContext,
  Plugin,
  TlsLifecycleEvent,
  PayloadEvent,
  ConnectionEvent,
} from "../types/types.ts";
import { payloadEvents } from "./event-manager/data-events/payloadEvents.ts";
import { RuleEngine } from "./rule-manager/RuleEngine.ts";
import { tlsLifecycleEvents } from "./event-manager/tls-events/tlsLifecycleEvents.ts";
import { TypedEventEmitter } from "./event-manager/EventBus.ts";
import type {
  ProxyEventMap,
  ProxyPlugin,
} from "./event-manager/proxy-events/proxyEvents.ts";

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

export class Proxy extends TypedEventEmitter<ProxyEventMap> {
  /**
   * @private
   */
  private pluginTimeoutMs: number;

  private httpServer: http.Server;
  // events
  private connectionEvents?: ConnectionEvent;
  private tlsLifecycleEvents?: TlsLifecycleEvent;
  private payloadEvents?: PayloadEvent;

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
      this.connectionEvents?.emit("TCP", { socket });
    });

    this.httpServer.on("connect", async (req, socket, head) => {
      await this.executePluginsWithTimeout("tunnel:connect", {
        req,
        socket,
        head: head as Buffer,
        events: {
          tlsEvent: this.tlsLifecycleEvents!,
          requestDataEvent: this.payloadEvents!,
        },
      });
      this.connectionEvents?.emit("CONNECT", { req, socket, head });
    });
    this.httpServer.on("request", async (req, res) => {
      await this.executePluginsWithTimeout("http:plain_request", {
        req,
        res,
      });
      this.connectionEvents?.emit("HTTP:PLAIN", { req, res });
    });

    // bind server error
    this.httpServer.on("error", async (err) => {
      await this.executePluginsWithTimeout("error", err);
    });

    // other events (inner)

    this.connectionEvents?.on(
      "CONNECT:PRE_ESTABLISH",
      async ({ ctx, socket }) => {
        await this.executePluginsWithTimeout("tunnel:pre_establish", {
          ctx,
          socket,
        });
      },
    );
    this.connectionEvents?.on(
      "CONNECT:ESTABLISHED",
      async ({ ctx, socket }) => {
        await this.executePluginsWithTimeout("tunnel:established", {
          ctx,
          socket,
        });
      },
    );

    this.tlsLifecycleEvents?.on("TLS:LEAF_GENERATED", async ({ ctx }) => {
      await this.executePluginsWithTimeout("tls:leaf_generated", {
        ctx,
      });
    });
    this.tlsLifecycleEvents?.on("TLS:SERVER_CREATED", async ({ ctx }) => {
      await this.executePluginsWithTimeout("tls:server_created", {
        ctx,
      });
    });

    this.payloadEvents?.on("PAYLOAD:REQUEST", async ({ ctx }) => {
      await this.executePluginsWithTimeout("http:decrypted_request", { ctx });
    });
    this.payloadEvents?.on("PAYLOAD:RESPONSE", async ({ ctx }) => {
      await this.executePluginsWithTimeout("decrypted_response", { ctx });
    });
  }

  /**
   *
   * @static -> unregister middleware
   *
   */
  public static unRegisterPlugins(plugins: Plugin[]) {
    PluginRegistry.unRegisterPlugins(plugins);
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
    // initialize events
    this.connectionEvents = connectionEvents;
    this.tlsLifecycleEvents = tlsLifecycleEvents;
    this.payloadEvents = payloadEvents;
    // bind all events
    this.bindAllEvents();
  }

  // --- PLUGIN SYSTEM ---
  public use(plugin: ProxyPlugin | ((proxy: Proxy) => void)) {
    if (typeof plugin === "function") {
      plugin(this);
    } else {
      plugin.apply(this);
      if (plugin.name) console.info(`Loaded plugin: ${plugin.name}`);
    }
    return this; // Enable chaining
  }

  public listen(port: number, callback?: () => void | Promise<void>) {
    if (this.httpServer) {
      this.httpServer.listen(port, async () => {
        if (callback) {
          await callback();
        } else {
          console.info("Server started\n", this.httpServer?.address());
        }
      });
    }
  }

  public stop(): Promise<void> {
    if (!this.httpServer?.listening) return Promise.resolve();

    return new Promise((resolve, reject) => {
      // force close all active and idle sockets
      if ("closeAllConnections" in this.httpServer) {
        this.httpServer.closeAllConnections();
      }
      this.httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  // ---------- this will be plugin level ----------------

  public saveHostToBypass(host: string | string[], error?: Error) {
    if (Array.isArray(host)) {
      host.forEach((h) => RuleEngine.saveHostToBypass(h, error));
    } else {
      RuleEngine.saveHostToBypass(host, error);
    }
  }
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
