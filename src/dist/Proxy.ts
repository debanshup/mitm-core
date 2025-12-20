import * as http from "http";
import { WebSocketServer } from "ws";
import Stream from "stream";
import net, { isIPv4 } from "net";
import {
  ConnectionTypes,
  connectionEvents,
} from "../observer/connection_type/emitter.ts";

/**
 * @important register middleware in the main app / here to auto forward req or res to middleware
 */
export default class Proxy {
  /**
   * @private
   */
  private httpServer: http.Server | undefined;
  private wsServer: WebSocketServer | undefined;
  // private upstream: net.Socket | undefined;
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

  /**
   *
   * @static
   *
   */
  public static async registerMiddleware() {
    await import("../middleware/middleware.ts");
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
        // disable nagle's
        (socket as net.Socket).setNoDelay(true);
        connectionEvents.emit(ConnectionTypes.CONNECT, { req, socket });
        socket.on("error", (err: Error) => {
          if (!socket.destroyed) {
            socket.destroy();
          }
          console.error("socket", err, "for", req.url);
          
        });
        socket.on("close", () => {
          if (!socket.destroyed) {
            socket.destroy();
          }
        });
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
