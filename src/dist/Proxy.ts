import * as http from "http";
import { WebSocketServer } from "ws";
import Stream from "stream";
import net, { isIPv4, Socket } from "net";
import {
  ConnectionTypes,
  connectionEvents,
} from "../core/event-manager/EventBus.ts";
import type { Iplugins } from "../interfaces/IPlugins.ts";
import { PluginRegistry, type Plugin } from "../plugins/PluginRegistry.ts";
import { ContextManager } from "../core/context-manager/ContextManager.ts";
import { PipelineCompiler } from "../core/pipelines/PipelineCompiler.ts";

/**
 * @important register middleware in the main app / here to auto forward req or res to middleware
 */
export default class Proxy {
  /**
   * @private
   */
  private httpServer: http.Server | undefined;
  private wsServer: WebSocketServer | undefined;
  private pipelines = {};

  // private upstream: net.Socket | undefined;

  /**
   *
   * @static -> register middleware
   *
   */
  public static async registerMiddleware() {
    await import("../middleware/middleware.ts");
  }
  /**
   *
   * @static -> register handlers
   *
   */
  public static registerPlugins(plugins: Plugin[]) {
    PluginRegistry.registerPlugins(plugins);
    // console.info(PluginRegistry.getEnabledPlugins())
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
    }
    if (!this.wsServer) {
      this.wsServer = new WebSocketServer({ server: this.httpServer });
    }
  }

  public init() {
    this.pipelines = PipelineCompiler.compile(
      PluginRegistry.getEnabledPlugins()
    );

    console.info("Pipelines:", this.pipelines);
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
    tcpConnectionHandler?: (socket: Socket, next: () => void) => void
  ) {
    this.httpServer?.on("connection", (socket) => {
      const defaultCallback = () => {
        // disable nagle's at tcp level
        socket.setNoDelay(true);
        socket.on("error", (err: Error) => {
          if (!socket.destroyed) {
            socket.destroy();
          }
          console.error("socket", err);
        });
        socket.on("close", () => {
          if (!socket.destroyed) {
            socket.destroy();
          }
        });

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
      next: () => void
    ) => void
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
      next: () => void
    ) => void
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
