import type { ClientRequest } from "http";
import type { RequestScope } from "../../scope/types";
import http from "http";
import https from "https";
export class WSUpstreamInitiator {
  public static init(targetUrl: URL, scope: RequestScope): ClientRequest {
    const { request } = scope;

    const isSecure =
      targetUrl.protocol === "wss:" || targetUrl.protocol === "https:";

    if (
      !isSecure &&
      targetUrl.protocol !== "ws:" &&
      targetUrl.protocol !== "http:"
    ) {
      throw new Error(`Unsupported WebSocket protocol: ${targetUrl.protocol}`);
    }

    const requestModule = isSecure ? https : http;

    const requestHeaders: Record<string, string | string[]> = {};

    for (const [key, value] of Object.entries(
      request.client.req?.headers ?? {},
    )) {
      if (value !== undefined) {
        requestHeaders[key] = value;
      }
    }

    // The Host header must represent the upstream server.
    requestHeaders.host = targetUrl.host;

    // Explicitly establish the WebSocket handshake.
    requestHeaders.connection = "Upgrade";
    requestHeaders.upgrade = "websocket";

    const upstreamReq = requestModule.request({
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isSecure ? 443 : 80),
      method: request.client.req?.method || "GET",
      path: targetUrl.pathname + targetUrl.search,
      headers: requestHeaders,
      timeout: 60_000,
      maxHeaderSize: 128 * 1024,
      rejectUnauthorized: false,
    });

    upstreamReq.setNoDelay?.(true);

    upstreamReq.end();

    return upstreamReq;
  }
}
