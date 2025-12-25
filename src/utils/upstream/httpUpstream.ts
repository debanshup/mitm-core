import http, { IncomingMessage, ServerResponse } from "http";
import { parseHttpReqData } from "../parser/parseReqData.ts";

export function createHTTPUpstream(
  req: IncomingMessage,
  res: ServerResponse
): http.ClientRequest {
  const { host, port, method, path, headers } = parseHttpReqData(req);
  // console.info("Via",req.headers["via"])
  // console.info("X-Forwarded-For", req.headers["X-Forwarded-For"])
  // console.info("Forwarded",req.headers["Forwarded"])
  // console.info("X-Forwarded-Proto",req.headers["X-Forwarded-Proto"])
  // console.info("X-Real-IP",req.headers["X-Real-IP"])
  // console.info("Cookie",req.headers.cookie)
  // console.info(
  //   req.headers["proxy-connection"],
  //   req.headers["proxy-authorization"],
  //   req.headers["upgrade"],
  //   req.headers["te"]
  // );

  delete req.headers["proxy-connection"];
  delete req.headers["proxy-authorization"];
  delete req.headers["te"];
  delete req.headers["upgrade"];

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

// Via

// Forwarded

// X-Forwarded-For

// X-Forwarded-Proto

// X-Real-IP
// delete req.headers["proxy-connection"];
// delete req.headers["proxy-authorization"];
// delete req.headers["connection"];
