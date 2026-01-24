import * as http from "http";
// import { WebSocketServer } from "ws";
import tls from "tls";
import Stream, { Duplex, pipeline } from "stream";
import { Socket } from "net";
import {
  ConnectionTypes,
  connectionEvents,
} from "../core/event-manager/EventBus.ts";
import { PluginRegistry, type Plugin } from "../plugins/PluginRegistry.ts";
import Pipeline from "../core/pipelines/PipelineCompiler.ts";
// import ws, { WebSocketServer } from "ws";

/**
 * @important register middleware in the main app / here to auto forward req or res to middleware
 */
export default class Proxy {
  /**
   * @private
   */
  private httpServer: http.Server | undefined;
  // private wsServer: WebSocketServer | undefined;
  private static isMiddlewareRegistered: boolean = false;

  // private upstream: net.Socket | undefined;

  /**
   *
   * @static -> register middleware
   *
   */
  public static async registerMiddleware() {
    if (!this.isMiddlewareRegistered) {
      await import("../middleware/middleware.ts");
      this.isMiddlewareRegistered = true;
      console.info("Middleware registered successfully");
    } else {
      throw Error("Middleware already registered!");
    }
    return this;
  }
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

      // if (!this.wsServer) {
      //   this.wsServer = new WebSocketServer({ server: this.httpServer });
      // }

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

  public static initPipelines() {
    Pipeline.compile();
  }

  public listen(port: number, callback?: () => void) {
    if (this.httpServer) {
      this.httpServer?.listen(port);
      if (callback) {
        callback();
      } else {
        console.info("Server started\n", this.httpServer.address());
      }
    }
  }

  public onTCPconnection(
    tcpConnectionHandler?: (socket: Socket, next: () => void) => void,
  ) {
    this.httpServer?.on("connection", (socket) => {
      const defaultCallback = () => {
        connectionEvents.emit(ConnectionTypes.TCP, { socket });
      };

      if (tcpConnectionHandler) {
        tcpConnectionHandler(socket, defaultCallback);
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
      next: () => void,
    ) => void,
  ) {
    this.httpServer?.on("connect", (req, socket, head) => {
      const defaultCallback = () => {
        connectionEvents.emit(ConnectionTypes.CONNECT, { req, socket, head });
      };
      if (connectHandler) {
        connectHandler(req, socket, head, defaultCallback);
      } else {
        defaultCallback();
      }
    });
  }

  public onRequest(
    reqHandler?: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      next: () => void,
    ) => void,
  ) {
    this.httpServer?.on("request", (req, res) => {
      const defaultCallback = () => {
        connectionEvents.emit(ConnectionTypes.HTTP, { req, res });
      };
      if (reqHandler) {
        reqHandler(req, res, defaultCallback);
      } else {
        defaultCallback();
      }
    });
  }
  //   public onResponse(
  //     callback: (req: http.IncomingMessage, res: http.ServerResponse) => void
  //   ) {
  //     this.httpServer?.on("", (req, res) => {
  //       callback(req, res);
  //     });
  //   }
  public onError(errorHandler: (err: Error) => void) {
    this.httpServer?.on("error", (err) => errorHandler(err));
  }

  public close(): Promise<void> {
    if (!this.httpServer?.listening) return Promise.resolve();

    return new Promise((resolve, reject) => {
      this.httpServer!.close((err) => {
        if (err) reject(err);
        else resolve(); // wait until fully closed
      });
    });
  }
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
