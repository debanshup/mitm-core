import type { ClientRequest, IncomingMessage, ServerResponse } from "http";
import type { Duplex } from "stream";
import {
  parseHttpRequestData,
  parseConnectData,
} from "../../utils/parser/parseReqData";
import { ContextManager } from "./ContextManager";
import type { RequestScope } from "./types";

export class ScopeMutator {
  /**
   * Initializes the root scope for a raw TCP socket connection.
   */
  public static initializeSessionScope(socket: Duplex): RequestScope {
    socket.on("error", () => {
      // fail-safe: prevent unhandled socket errors from crashing the process
    });

    const session = ContextManager.getOrCreateSessionContext(socket);
    const request = ContextManager.getOrCreateRequestContext(session);
    const lifecycle = ContextManager.getOrCreateRequestLifecycle(
      request.requestId,
    );

    return { session, request, lifecycle };
  }

  /**
   * Populates scope for unencrypted HTTP/1.x requests.
   */
  public static applyHttpPlainState(
    scope: RequestScope,
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean {
    if (!req || !res) {
      return false;
    }
    const { session, request, lifecycle } = scope;

    session.protocol.connectionType = "http";
    session.protocol.httpVersion = req.httpVersion?.startsWith("1")
      ? "h1"
      : "unknown";

    request.client.req = req;
    request.client.res = res;

    request.client.method = req.method;
    request.client.url = req.url;
    request.client.headers = req.headers;

    const { host, fullUrl } = parseHttpRequestData(req);

    // client to proxy
    request.target.originalHost = host;
    request.target.originalUrl = fullUrl;

    // proxy to upstream
    request.target.host = host;
    request.target.url = fullUrl;

    lifecycle.nextPhase = "request";
    return true;
  }

  /**
   * Populates scope for the HTTP CONNECT method (TLS handshake preparation).
   */
  public static applyConnectState(
    scope: RequestScope,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean {
    if (!req || !socket || !head) {
      return false;
    }
    const { session, request, lifecycle } = scope;

    session.protocol.connectionType = "https";
    session.protocol.httpVersion = req.httpVersion?.startsWith("1")
      ? "h1"
      : "unknown";

    session.socket = socket;
    session.head = head;

    // Store head buffer in request context so the TLS upgrader can consume it later
    request.client.req = req;
    request.client.headers = req.headers;

    const { host, url } = parseConnectData(req);

    request.target.originalHost = host;
    request.target.originalUrl = url;

    lifecycle.nextPhase = "handshake";
    return true;
  }

  /**
   * Populates scope for a successfully decrypted HTTPS request payload.
   * Returns false if the request object is missing.
   */
  public static applyHttpsDecryptedState(scope: RequestScope): boolean {
    const { request, lifecycle } = scope;

    if (!request.client.req) {
      return false;
    }

    request.client.method = request.client.req.method;
    request.client.url = request.client.req.url;
    request.client.headers = request.client.req.headers;

    const { host, fullUrl } = parseHttpRequestData(request.client.req);

    request.target.host = host;
    request.target.url = fullUrl;

    lifecycle.nextPhase = "request";
    return true;
  }

  public static applyUpgradeState(
    scope: RequestScope,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean {
    if (!req || !socket) return false;

    const { session, request, lifecycle } = scope;

    session.protocol.connectionType = "http";
    session.protocol.httpVersion = req.httpVersion?.startsWith("1")
      ? "h1"
      : "unknown";

    request.client.req = req;
    request.client.method = req.method;
    request.client.url = req.url;
    request.client.headers = req.headers;

    const { host, fullUrl } = parseHttpRequestData(req);
    let targetUrl: URL;
    try {
      targetUrl = new URL(fullUrl);
    } catch {
      targetUrl = new URL(req.url || "/", `http://${host}`);
    }

    const isSecure =
      (socket as any).encrypted === true ||
      (req.socket as any).encrypted === true;

    const protocol = isSecure ? "wss" : "ws";

    targetUrl.protocol = protocol;
    request.target.originalHost = host;
    request.target.originalUrl = fullUrl;
    request.target.host = host;
    request.target.url = targetUrl.toString();

    request.webSocket = {
      isUpgraded: false,
      rawUpgradeSocket: socket,
      upgradeHead: head,
    };

    lifecycle.nextPhase = "request";
    return true;
  }

  public static async applyUpstreamInitState(
    scope: RequestScope,
    upstreamReq: ClientRequest,
  ) {
    if (!upstreamReq) {
      return false;
    }
    scope.request.upstream.req = upstreamReq;
    scope.lifecycle.nextPhase = "response";
    return true;
  }

  /**
   * Populates scope when the upstream server responds.
   * Returns false if the response is invalid.
   */
  public static applyResponseState(
    scope: RequestScope,
    upstreamRes: IncomingMessage,
  ): boolean {
    if (!upstreamRes) {
      return false;
    }

    const { request, lifecycle } = scope;

    request.upstream.res = upstreamRes;

    lifecycle.nextPhase = "response";

    return true;
  }

  /**
   * Safely transitions the lifecycle to a completed state.
   */
  public static finishPipeline(scope: RequestScope): void {
    scope.lifecycle.state.set("request.finished", true);
    scope.lifecycle.nextPhase = undefined;
  }
  /**
   * Safely transitions the lifecycle to an error state.
   */
  public static failPipeline(scope: RequestScope, err: Error | unknown): void {
    scope.lifecycle.state.set("error", true);
    // Explicitly halt the pipeline on fatal errors
    scope.lifecycle.nextPhase = undefined;
  }
}
