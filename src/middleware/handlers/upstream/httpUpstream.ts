import http, { IncomingMessage, ServerResponse } from "http";
import { parseHttpReqData } from "../../../utils/parseReqData.ts";

export function createHTTPUpstream(
  req: IncomingMessage,
  res: ServerResponse
): http.ClientRequest {
  const { host, port, method, path, headers } = parseHttpReqData(req);
  console.info(headers);
  const upstream = http.request({
    host,
    port,
    method,
    path,
    headers,
  });

  // disable nagle's
  upstream.setNoDelay(true);

  upstream.on("error", (err) => {
    console.error("http upstream", err, "for", host! + path);
    if (!upstream.destroyed) {
      upstream.destroy();
    }
    res.end();
  });
  upstream.on("close", () => {
    if (!upstream.destroyed) {
      upstream.destroy();
    }
  });

  return upstream;
}
