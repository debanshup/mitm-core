import * as http from "http";
import tls from "tls";
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
  forceEncrypted?: boolean,
) {
  const isEncrypted =
    forceEncrypted ??
    (req.socket instanceof tls.TLSSocket || (req.socket as any).encrypted);

  const protocol = isEncrypted ? "https:" : "http:";
  const defaultPort = isEncrypted ? 443 : 80;

  const rawUrl = req.url!.startsWith("http")
    ? req.url!
    : `${protocol}//${req.headers.host}${req.url}`;

  const parsedUrl = new URL(rawUrl);

  return {
    protocol: parsedUrl.protocol,
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : defaultPort,
    path: parsedUrl.pathname + parsedUrl.search,
    fullUrl: rawUrl,
    isEncrypted,
  };
}
