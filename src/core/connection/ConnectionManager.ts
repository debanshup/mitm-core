import type * as net from "net";

class ConnectionManager {
  private static instance: ConnectionManager;
  private activeSockets = new Set<net.Socket>();

  private constructor() {}

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * Tracks a socket and automatically untracks it when closed.
   */
  public track(socket: net.Socket): void {
    if (this.activeSockets.has(socket)) {
      return;
    }
    this.activeSockets.add(socket);

    socket.once("close", () => {
      this.activeSockets.delete(socket);
    });
  }

  /**
   * Destroys all tracked connections.
   * Used during proxy shutdown to prevent event loop hanging.
   */
  public destroyAll(): void {
    for (const socket of this.activeSockets) {
      if (!socket.destroyed) {
        socket.destroy();
      }
    }
    this.activeSockets.clear();
  }

  /**
   * Optional: Returns current active connection count for telemetry/metrics.
   */
  public getCount(): number {
    return this.activeSockets.size;
  }
}

export const connectionManager = ConnectionManager.getInstance();
