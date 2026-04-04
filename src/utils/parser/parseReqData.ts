import * as http from "http";
// export function parseHttpReqData(req: http.IncomingMessage) {
//   const hostHeader = req.headers.host;

//   if (!hostHeader) {
//     throw new Error("Missing Host header");
//   }

//   const [host, portFromHost] = hostHeader.split(":");

//   const isTLS = (req.socket as any).encrypted === true;

//   return {
//     host,
//     port: portFromHost ? Number(portFromHost) : isTLS ? 443 : 80,
//     method: req.method,
//     headers: req.headers,
//     path: req.url,
//   };
// }

export function parseConnectData(req: http.IncomingMessage) {
  const [host, port] = req.url!.split(":");
  return {
    host,
    port: port ? Number(port) : 443,
  };
}
