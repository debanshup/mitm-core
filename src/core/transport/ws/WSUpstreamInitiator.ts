import type { ClientRequest } from "http";
import type { RequestScope } from "../../scope/types";
import crypto from "crypto";
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

    const clientReq = scope.request.client.req!;

    const requestHeaders: Record<string, string> = {
      host: targetUrl.host,
      connection: "Upgrade",
      upgrade: "websocket",
      "sec-websocket-version": "13",
      "sec-websocket-key": crypto.randomBytes(16).toString("base64"),
    };

    if (clientReq.headers.origin) {
      requestHeaders.origin = clientReq.headers.origin;
    }

    if (clientReq.headers["user-agent"]) {
      requestHeaders["user-agent"] = clientReq.headers["user-agent"];
    }

    if (clientReq.headers.cookie) {
      requestHeaders.cookie = clientReq.headers.cookie;
    }

    const requestOptions: http.RequestOptions | https.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isSecure ? 443 : 80),
      method: request.client.req?.method || "GET",
      path: targetUrl.pathname + targetUrl.search,
      headers: requestHeaders,
      timeout: 60_000,
      maxHeaderSize: 128 * 1024,
    };

    if (isSecure) {
      Object.assign(requestOptions, {
        rejectUnauthorized: false, // TODO: add this in proxy config
        servername: targetUrl.hostname,
        ALPNProtocols: ["http/1.1"],
      });
    }

    const upstreamReq = requestModule.request(requestOptions);

    return upstreamReq;
  }
}
