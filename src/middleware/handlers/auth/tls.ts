import tls from "tls";
import net from "net";

export function createTLSServerSocket(
  rawSocket: net.Socket,
  options: tls.TlsOptions = {}
): tls.TLSSocket {
  const tlsSocket = new tls.TLSSocket(rawSocket, {
    ...options,
    isServer: true
  });

  tlsSocket.on("error", () => tlsSocket.destroy());
  tlsSocket.on("close", () => tlsSocket.destroy());

  return tlsSocket;
}
