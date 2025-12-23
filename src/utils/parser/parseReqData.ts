import * as http from "http";
export function parseHttpReqData(req: http.IncomingMessage) {
  const targetUrl = URL.parse(req.url!);
  console.info(targetUrl)

  return {
    host: targetUrl?.hostname,
    port: targetUrl?.port ? Number(targetUrl.port) : 80,
    method: req.method,
    headers: req.headers,
    path: targetUrl?.pathname,
  };
}

export function parseConnectData(req: http.IncomingMessage) {
  const [host, port] = req.url!.split(":");
  return {
    host,
    port: port ? Number(port) : 443,
  };
}
