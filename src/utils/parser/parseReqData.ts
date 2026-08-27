import * as http from "http";
import tls from "tls";
import net from "net";
 
export function parseConnectData(req: http.IncomingMessage) {
  if (!req || !req.url) {
    return {
      host: "",
      port: null,
      url: "",
    };
  }
  const [host, port] = req.url!.split(":");
  return {
    host: host!,
    port: port ? Number(port) : 443,
    url: req.url!,
  };
}


export function parseHttpRequestData(
  req: http.IncomingMessage,
  socketOverride?: tls.TLSSocket | net.Socket,
  forceEncrypted?: boolean,
) {
  const socket = socketOverride || req.socket;
  const headers = req.headers;

  const isEncrypted =
    forceEncrypted ??
    (socket instanceof tls.TLSSocket || (socket as any)?.encrypted === true);

  const transportProtocol = isEncrypted ? "https:" : "http:";

  const isWebSocket = headers.upgrade?.toLowerCase() === "websocket";

  const rawHost = headers.host || "";
  const rawPath = req.url || "/";

  const rawUrl =
    rawPath.startsWith("http://") || rawPath.startsWith("https://")
      ? rawPath
      : `${transportProtocol}//${rawHost}${rawPath}`;

  const parsedUrl = new URL(rawUrl);

  const port = parsedUrl.port ? Number(parsedUrl.port) : isEncrypted ? 443 : 80;

  return {
    protocol: parsedUrl.protocol,
    host: parsedUrl.hostname,
    port,
    path: parsedUrl.pathname + parsedUrl.search,
    fullUrl: parsedUrl.href,

    isEncrypted,

    // Application/protocol semantics
    applicationProtocol: isWebSocket ? "websocket" : "http",
  };
}
