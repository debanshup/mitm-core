import {
  ContextManager,
} from "../core/context-manager/ContextManager";
import Pipeline from "../core/pipelines/PipelineCompiler";
import { connectionEvents } from "../core/event-manager/connection-events/connectionEvents";
import { payloadEvents } from "../core/event-manager/payload-events/payloadEvents";
import {
  parseConnectData,
  parseHttpRequestData,
} from "../utils/parser/parseReqData";
import { normalizeHttpVersion } from "../core/handlers/utils/utils";
import type { RequestScope } from "../core/context-manager/types";

/**
 * Manages middleware registration and orchestrates the proxy connection lifecycle.
 * Configures event listeners to intercept network traffic, initializes request contexts,
 * and triggers the processing pipeline.
 */
export class Middleware {
  /**
   * Registers event listeners for various connection types (TCP, HTTP, CONNECT, HTTPS)
   * and initializes the proxy pipeline.
   *
   * @param options.initializePipelines - Whether to trigger pipeline compilation upon registration.
   */
  public static register({
    initializePipelines,
  }: {
    initializePipelines: boolean;
  }) {
    if (initializePipelines) {
      Pipeline.compile();
    } else {
      return;
    }
    connectionEvents.on("TCP", async ({ socket }) => {
      socket.on("error", () => {
        // fail-safe: do nothing
      });
      const sessionContext = ContextManager.getOrCreateSessionContext(socket);
      const requestContext =
        ContextManager.getOrCreateRequestContext(sessionContext);
      const lifecycle = ContextManager.getOrCreateRequestLifeCycle(
        requestContext.requestId,
      );
      const scope: RequestScope = {
        sessionContext,
        requestContext,
        lifecycle,
      };
      await Pipeline.run(scope);
    });

    connectionEvents.on("HTTP:PLAIN", async ({ req, res, scope }) => {
      const { sessionContext, requestContext, lifecycle } = scope;
      sessionContext.connectionType = "http";
      lifecycle.nextPhase = "request";
      requestContext!.req = req;
      requestContext!.res = res;
      const { host, fullUrl } = parseHttpRequestData(req);
      // client to proxy
      requestContext.clientToProxyHost = host;
      requestContext.clientToProxyUrl = fullUrl;
      sessionContext.httpVersion = normalizeHttpVersion(req.httpVersion);
      // proxy to upstream
      requestContext.proxyToUpstreamHost = host;
      requestContext.proxyToUpstreamUrl = fullUrl;

      // run pipeline
      await Pipeline.run(scope);
    });

    connectionEvents.on("CONNECT", async ({ req, socket, head, scope }) => {
      const { sessionContext, requestContext, lifecycle } = scope;
      sessionContext.socket = socket;
      sessionContext.connectionType = "https";
      lifecycle.nextPhase = "handshake";
      head = head;
      requestContext!.req = req;

      const { host, url } = parseConnectData(req);
      requestContext.clientToProxyHost = host;
      requestContext.clientToProxyUrl = url;

      // run pipeline
      await Pipeline.run(scope);
    });

    connectionEvents.on("HTTPS:DECRYPTED", async ({ scope }) => {
      const { sessionContext, requestContext, lifecycle } = scope;

      const req = requestContext.req;
      if (!req) {
        return;
      }

      const { host, fullUrl } = parseHttpRequestData(requestContext.req!);

      requestContext.proxyToUpstreamHost = host;
      requestContext.proxyToUpstreamUrl = fullUrl;
      lifecycle.nextPhase = "request";

      await Promise.allSettled(
        payloadEvents
          .listeners("PAYLOAD:REQUEST")
          .map((listener) => listener({ scope })),
      );
      await Pipeline.run(scope);
    });
  }
}
