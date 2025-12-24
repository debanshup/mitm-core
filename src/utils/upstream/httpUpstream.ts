import http, { IncomingMessage, ServerResponse } from "http";
import { parseHttpReqData } from "../parser/parseReqData.ts";

export function createHTTPUpstream(
  req: IncomingMessage,
  res: ServerResponse
): http.ClientRequest {
  const { host, port, method, path, headers } = parseHttpReqData(req);
  const upstream = http.request({
    host,
    port,
    method,
    path,
    headers,
  });
  // disable nagle's
  upstream.setNoDelay(true);


  return upstream;
}
