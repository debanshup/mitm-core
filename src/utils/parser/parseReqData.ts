import * as http from "http";
// import http2 from "http2";
import tls from "tls";
import net from "net";
// import { promisify } from "util";
// import { IncomingMessage } from "http";
// import type { Readable } from "stream";

// const gunzip = promisify(zlib.gunzip);
// const inflate = promisify(zlib.inflate);
// const brotliDecompress = promisify(zlib.brotliDecompress);

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

// h2 related logic will be implemented seperartely

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

  const isWebSocket = headers.upgrade?.toLowerCase() === "websocket";

  const rawProtocol = isEncrypted ? "https:" : "http:";

  const protocol = isWebSocket ? (isEncrypted ? "wss:" : "ws:") : rawProtocol;

  const rawHost = headers.host || "";
  const rawPath = req.url || "/";

  const defaultPort = protocol === "https:" || protocol === "wss:" ? 443 : 80;

  let parsedUrl: URL;

  if (isWebSocket) {
    const wsUrl = rawPath
      .replace(/^http:\/\//, "ws://")
      .replace(/^https:\/\//, "wss://");

    parsedUrl = new URL(
      wsUrl.startsWith("ws://") || wsUrl.startsWith("wss://")
        ? wsUrl
        : `${protocol}//${rawHost}${rawPath}`,
    );
  } else {
    const rawUrl =
      rawPath.startsWith("http://") || rawPath.startsWith("https://")
        ? rawPath
        : `${rawProtocol}//${rawHost}${rawPath}`;

    parsedUrl = new URL(rawUrl);
  }

  const port = parsedUrl.port ? Number(parsedUrl.port) : defaultPort;

  return {
    protocol: parsedUrl.protocol,
    host: parsedUrl.hostname,
    port,
    path: parsedUrl.pathname + parsedUrl.search,
    fullUrl: parsedUrl.href,
    isEncrypted,
    isWebSocket,
  };
}
