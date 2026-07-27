import type { IncomingMessage, ServerResponse } from "http";
import type { Duplex } from "stream";
import {
  parseHttpRequestData,
  parseConnectData,
} from "../../utils/parser/parseReqData";
import { normalizeHttpVersion } from "../handlers/utils/utils";
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

    const sessionContext = ContextManager.getOrCreateSessionContext(socket);
    const requestContext =
      ContextManager.getOrCreateRequestContext(sessionContext);
    const lifecycle = ContextManager.getOrCreateRequestLifeCycle(
      requestContext.requestId,
    );

    return { sessionContext, requestContext, lifecycle };
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
    const { sessionContext, requestContext, lifecycle } = scope;

    sessionContext.connectionType = "http";
    sessionContext.httpVersion = normalizeHttpVersion(req.httpVersion);

    requestContext.req = req;
    requestContext.res = res;

    const { host, fullUrl } = parseHttpRequestData(req);

    // client to proxy
    requestContext.clientToProxyHost = host;
    requestContext.clientToProxyUrl = fullUrl;

    // proxy to upstream
    requestContext.proxyToUpstreamHost = host;
    requestContext.proxyToUpstreamUrl = fullUrl;

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
    const { sessionContext, requestContext, lifecycle } = scope;

    sessionContext.connectionType = "https";
    sessionContext.socket = socket;

    // Store head buffer in request context so the TLS upgrader can consume it later
    requestContext.req = req;
    sessionContext.head = head;

    const { host, url } = parseConnectData(req);

    requestContext.clientToProxyHost = host;
    requestContext.clientToProxyUrl = url;

    lifecycle.nextPhase = "handshake";
    return true;
  }

  /**
   * Populates scope for a successfully decrypted HTTPS request payload.
   * Returns false if the request object is missing.
   */
  public static applyHttpsDecryptedState(scope: RequestScope): boolean {
    const { requestContext, lifecycle } = scope;

    if (!requestContext.req) {
      return false;
    }

    const { host, fullUrl } = parseHttpRequestData(requestContext.req);

    requestContext.proxyToUpstreamHost = host;
    requestContext.proxyToUpstreamUrl = fullUrl;

    lifecycle.nextPhase = "request";
    return true;
  }

  /**
   * Populates scope when the upstream server replies.
   */
  public static applyResponseState(
    scope: RequestScope,
    upstreamRes: IncomingMessage,
    responseBody?: any, // Define your parsed body type here
  ): void {
    const { requestContext } = scope;

    requestContext.upstreamRes = upstreamRes;
    requestContext.responseHeaders = upstreamRes.headers;
    requestContext.status = {
      statusCode: Number(upstreamRes.statusCode) || 500,
      statusText: upstreamRes.statusMessage || "",
    };

    if (responseBody) {
      requestContext.responseBody = responseBody;
    }
  }
  /**
   * Safely transitions the lifecycle to a completed state.
   */
  public static finishPipeline(scope: RequestScope): void {
    scope.lifecycle.state.set("isFinished", true);
    scope.lifecycle.nextPhase = undefined;
  }
  /**
   * Safely transitions the lifecycle to an error state.
   */
  public static failPipeline(scope: RequestScope, err: Error | unknown): void {
    scope.lifecycle.state.set("error", true);
    scope.lifecycle.state.set("lastError", err);
    // Explicitly halt the pipeline on fatal errors
    scope.lifecycle.nextPhase = undefined;
  }
}
