import * as http from "http";
export function parseHttpReqData(req: http.IncomingMessage) {
  const hostHeader = req.headers.host; // ⭐ NEW (source of truth)

  if (!hostHeader) {
    throw new Error("Missing Host header");
  }

  const [host, portFromHost] = hostHeader.split(":"); // ⭐ NEW

  const isTLS = (req.socket as any).encrypted === true; // ⭐ NEW

  return {
    host,
    port: portFromHost
      ? Number(portFromHost)
      : isTLS
      ? 443 // ⭐ FIXED
      : 80,
    method: req.method,
    headers: req.headers,
    path: req.url, // ⭐ FIXED (keep path as-is)
  };
}


export function parseConnectData(req: http.IncomingMessage) {
  const [host, port] = req.url!.split(":");
  return {
    host,
    port: port ? Number(port) : 443,
  };
}
