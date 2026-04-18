import https from "https";
import http from "http";
import tls from "tls";
// import type { Phase } from "../../phase/Phase.ts";
import { BaseHandler } from "./base/base.handler";
import { pipeline } from "stream";
import { ProxyUtils } from "../utils/ProxyUtils";
import { ResponseCache } from "../cache-manager/ResponseCache";
import { readFileSync } from "fs";
import { CA_PATH } from "../../constants/path";
import path from "path";
import type { ProxyContext } from "../context-manager/ContextManager";
export class RequestHandler extends BaseHandler {
  readonly phase = "request";
  private static httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 60000,
    timeout: 30000,
    maxSockets: Infinity,
    maxFreeSockets: 64,
    scheduling: "lifo",
    ca: [
      ...tls.rootCertificates,
      readFileSync(path.join(CA_PATH.CA_DIR, "CA.crt")), // support for proxy chaining (eg. proxying a proxy ) and corporate proxy
    ],
  });

  private static httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 60000,
    timeout: 30000,
    maxSockets: Infinity,
    maxFreeSockets: 64,
    scheduling: "lifo",
  });

  async handle(ctx: ProxyContext) {
    const { requestContext } = ctx;
    if (!requestContext?.req) {
      return;
    }
    let targetUrl: URL;

    try {
      if (ctx.proxyToUpstreamUrl) {
        targetUrl = new URL(ctx.proxyToUpstreamUrl);
      } else {
        // fail safe
        if (requestContext.req.url?.startsWith("http")) {
          targetUrl = new URL(requestContext!.req.url);
        } else {
          targetUrl = new URL(
            requestContext!.req.url || "/",
            `https://${requestContext.req.headers.host}`,
          );
        }
      }
    } catch (error) {
      console.error(error);
      requestContext.res!.statusCode = 400;
      requestContext.res!.end("Invalid URL");
      return;
    }

    // console.info(targetUrl)

    const isHTTPS = ctx.connectionType === "https";
    const requestModule = isHTTPS ? https : http;
    const agent = isHTTPS
      ? RequestHandler.httpsAgent
      : RequestHandler.httpAgent;
    const cache_key = ResponseCache.generateKey(requestContext.req);
    const cached = ResponseCache.get(cache_key);

    if (cached?.etag) {
      requestContext.req!.headers.etag = cached.etag;
    }

    const upstream = requestModule.request({
      host: targetUrl.hostname,
      port: targetUrl.port || (isHTTPS ? 443 : 80),
      method: requestContext.req?.method,
      path: requestContext.req?.url,
      headers: {
        ...requestContext.req?.headers,
        host: targetUrl.hostname,
        connection: "keep-alive",
      },
      agent,
      timeout: 20000,
    });
    // disable nagle's
    upstream.setNoDelay(true);
    requestContext.upstreamReq = upstream;

    // Pipe Client Request -> Upstream Server

    pipeline(requestContext.req, upstream, (err) => {
      if (err) {
        const isClientAbort =
          err.code === "ECONNRESET" || err.message === "aborted";

        if (isClientAbort) {
          console.debug(`[Stream] Client aborted the request mid-upload.`);
        } else {
          console.error(
            `[Stream Error] Client to Upstream: ${err.message || err.code}:${ctx.clientToProxyHost}`,
          );

          if (requestContext.res && !requestContext.res.headersSent) {
            try {
              requestContext.res.setHeader("Connection", "close");
              requestContext.res.statusCode = 502;
              requestContext.res.end("Bad Gateway");
            } catch (resErr) {
              console.error(
                `[STREAM_ERR] 502_SEND_FAIL | Host: ${ctx.clientToProxyHost}`,
              );
            }
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
        ProxyUtils.cleanUp([upstream, requestContext.req?.socket!]);
        requestContext.state.set("error", true);
      }
    });
    requestContext.nextPhase = "response";
  }
}
