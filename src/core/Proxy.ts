await import("../middleware/middleware.ts");
import * as http from "http";
import tls from "tls";
import Stream, { pipeline } from "stream";
import { Socket } from "net";
import { PluginRegistry } from "../plugins/PluginRegistry.ts";
import { connectionEvents } from "./event-manager/connection-events/connectionEvents.ts";
import type {
  ProxyContext,
  Plugin,
  TlsEvent,
  DataEvent,
} from "../types/types.ts";
import { payloadEvents } from "./event-manager/data-events/payloadEvents.ts";
import { RuleEngine } from "./rule-manager/RuleEngine.ts";
import { tlsLifecycleEvents } from "./event-manager/tls-event/tlsLifecycleEvents.ts";

/**
 * @important register middleware in the main app / here to auto forward req or res to middleware
 */
export class Proxy {
  /**
   * @private
   */
  private httpServer: http.Server | undefined;
  // private wsServer: WebSocketServer | undefined;

  /**
   *
   * @static -> register handlers
   *
   */
  public static registerPlugins(plugins: Plugin[]) {
    PluginRegistry.registerPlugins(plugins);
    return this;
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
   * @constructor
   */
  constructor() {
    if (!this.httpServer) {
      this.httpServer = http.createServer({
        keepAlive: true,
      });
      this.httpServer?.on("upgrade", (req, socket, head) => {
        console.info("Upgrading for", req.url);
        const host = req.headers.host;
        if (!host) return socket.destroy();

        const [hostname, portStr] = host.split(":");
        const port = parseInt(portStr!) || 443;

        // Use TLS for the upstream connection to handle HTTPS/WSS
        const upstream = tls.connect(
          port,
          hostname,
          { rejectUnauthorized: false },
          () => {
            // 1. Manually finish the handshake for the browser
            socket.write(
              "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n\r\n",
            );
            upstream.write(head);

            // 2. Bidirectional Pipeline
            pipeline(socket, upstream, () => {
              socket.destroy();
              upstream.destroy();
            });
            pipeline(upstream, socket, () => {
              socket.destroy();
              upstream.destroy();
            });
          },
        );

        upstream.on("error", () => {
          socket.destroy();
          upstream.destroy();
        });
      });
    }
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

  public onTCPconnection(
    tcpConnectionHandler?: (
      socket: Socket,
      defaultHandler: () => void,
    ) => void | Promise<void>,
  ) {
    this.httpServer?.on("connection", async (socket) => {
      const defaultCallback = () => {
        connectionEvents.emit("TCP", { socket });
      };

      if (tcpConnectionHandler) {
        await tcpConnectionHandler(socket, defaultCallback);
      } else {
        defaultCallback();
      }
    });
  }

  public onConnect(
    connectHandler?: (
      req: http.IncomingMessage,
      socket: Stream.Duplex,
      head: any,
      events: { tlsEvent: TlsEvent; requestDataEvent: DataEvent },

      defaultHandler: () => void,
    ) => void | Promise<void>,
  ) {
    this.httpServer?.on("connect", async (req, socket, head) => {
      const defaultCallback = () => {
        connectionEvents.emit("CONNECT", { req, socket, head });
      };
      if (connectHandler) {
        await connectHandler(
          req,
          socket,
          head,
          { tlsEvent: tlsLifecycleEvents, requestDataEvent: payloadEvents },
          defaultCallback,
        );
      } else {
        defaultCallback();
      }
    });
  }

  public onHttpRequest(
    reqHandler?: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      defaultHandler: () => void,
    ) => void | Promise<void>,
  ) {
    this.httpServer?.on("request", async (req, res) => {
      const defaultCallback = () => {
        connectionEvents.emit("HTTP:PLAIN", { req, res });
      };
      if (reqHandler) {
        await reqHandler(req, res, defaultCallback);
      } else {
        defaultCallback();
      }
    });
  }
  public onDecryptedRequest(
    callback: (payload: { ctx: ProxyContext }) => void | Promise<void>,
  ) {
    // Passes the developer's callback directly to the event listener
    payloadEvents.on("PAYLOAD:REQUEST", callback);
  }

  public onResponseData(
    callback: (payload: { ctx: ProxyContext }) => void | Promise<void>,
  ) {
    // Passes the developer's callback directly to the event listener
    payloadEvents.on("PAYLOAD:RESPONSE", callback);
  }

  public onTlsServerCreation(
    callback: (payload: { ctx?: ProxyContext }) => void | Promise<void>,
  ) {
    tlsLifecycleEvents.on("TLS:SERVER_CREATED", callback);
  }
  public onLeafCertificateCreation(
    callback: (payload: { ctx?: ProxyContext }) => void | Promise<void>,
  ) {
    tlsLifecycleEvents.on("TLS:LEAF_GENERATED", callback);
  }

  public onError(errorHandler: (err: Error) => void | Promise<void>) {
    this.httpServer?.on("error", (err) => errorHandler(err));
  }

  public stop(): Promise<void> {
    if (!this.httpServer?.listening) return Promise.resolve();

    return new Promise((resolve, reject) => {
      this.httpServer!.close((err) => {
        if (err) reject(err);
        else resolve(); // wait until fully closed
      });
    });
  }
  // ----------------------

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
