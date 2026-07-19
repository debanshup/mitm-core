import * as http from "http";
import http2 from "http2";
import tls from "tls";
import net from "net";
// import { promisify } from "util";
// import { IncomingMessage } from "http";
import type { Readable } from "stream";

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
  // 1. Safely resolve the socket
  const socket = socketOverride || req.socket;
  const headers = req.headers;

  // 2. Determine encryption state
  const isEncrypted =
    forceEncrypted ??
    (socket instanceof tls.TLSSocket || (socket as any)?.encrypted === true);

  const rawProtocol = isEncrypted ? "https:" : "http:";
  const rawHost = headers.host || "";
  const rawPath = req.url || "/";
  const defaultPort = rawProtocol === "https:" ? 443 : 80;

  // 3. Construct the full URL for parsing
  // Handle edge cases where an explicit H1 proxy request includes the full URL in the path
  const rawUrl = rawPath.startsWith("http")
    ? rawPath
    : `${rawProtocol}//${rawHost}${rawPath}`;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (err) {
    // Failsafe for completely malformed requests missing a host
    parsedUrl = new URL(`http://localhost${rawPath}`);
  }

  return {
    protocol: parsedUrl.protocol,
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : defaultPort,
    path: parsedUrl.pathname + parsedUrl.search,
    fullUrl: parsedUrl.href,
    isEncrypted,
  };
}
