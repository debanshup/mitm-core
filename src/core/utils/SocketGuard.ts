import type { Socket } from "net";
import type { TLSSocket } from "tls";
import { ProxyUtils } from "../utils/ProxyUtils";

type NetworkSocket = Socket | TLSSocket;

const guardedSockets = new WeakSet<NetworkSocket>();

export class SocketGuard {
  public static ensureCleanupGuards(socket: NetworkSocket): void {
    if (!socket || socket.destroyed) return;

    if (guardedSockets.has(socket)) return;
    guardedSockets.add(socket);

    socket.on("error", (err: NodeJS.ErrnoException) => {
      const silentCodes = [
        "ECONNRESET",
        "EPIPE",
        "ETIMEDOUT",
        "ERR_TLS_HANDSHAKE_TIMEOUT",
      ];

      if (!silentCodes.includes(err.code as string)) {
        console.error(
          `[SocketGuard] Persistent Socket Runtime Fault: ${err.message || err.code}`,
        );
      }
    });

    socket.once("close", (hadErr) => {
      if (hadErr) {
        console.debug(
          `[SocketGuard] Physical connection closed with error flag.`,
        );
      }
      ProxyUtils.cleanUp([socket]);
    });
  }
}
