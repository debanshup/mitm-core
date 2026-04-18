import { ContextManager } from "../core/context-manager/ContextManager";
import Pipeline from "../core/pipelines/PipelineCompiler";
import { connectionEvents } from "../core/event-manager/connection-events/connectionEvents";
import { payloadEvents } from "../core/event-manager/payload-events/payloadEvents";
import {
  parseConnectData,
  parseHttpRequestData,
} from "../utils/parser/parseReqData";
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
    }
    connectionEvents.on("TCP", async ({ socket }) => {
      socket.on("error", () => {
        // fail-safe: do nothing
      });
      const ctx = ContextManager.getContext(socket);
      await Pipeline.run(ctx);
    });
    connectionEvents.on("HTTP:PLAIN", async ({ req, res }) => {
      const ctx = ContextManager.getContext(req.socket);
      ctx.connectionType = "http";
      ctx.requestContext.nextPhase = "request";
      ctx.requestContext!.req = req;
      ctx.requestContext!.res = res;
      const { host, fullUrl } = parseHttpRequestData(req);
      // client to proxy
      ctx.clientToProxyHost = host;
      ctx.clientToProxyUrl = fullUrl;
      // proxy to upstream
      ctx.proxyToUpstreamHost = host;
      ctx.proxyToUpstreamUrl = fullUrl;

      // run pipeline
      await Pipeline.run(ctx);
    });

    connectionEvents.on("CONNECT", async ({ req, socket, head }) => {
      const ctx = ContextManager.getContext(socket);
      ctx.connectionType = "https";
      ctx.requestContext.nextPhase = "handshake";
      ctx.head = head;
      ctx.requestContext!.req = req;

      const { host, url } = parseConnectData(req);
      ctx.clientToProxyHost = host;
      ctx.clientToProxyUrl = url;

      // run pipeline
      await Pipeline.run(ctx);
    });

    connectionEvents.on("HTTPS:DECRYPTED", async ({ ctx }) => {
      // console.info("dec https fired!")
      const { host, fullUrl } = parseHttpRequestData(
        ctx.requestContext.req!,
        true,
      );

      ctx.proxyToUpstreamHost = host;
      ctx.proxyToUpstreamUrl = fullUrl;
      ctx.requestContext.nextPhase = "request";
      await Promise.all(
        payloadEvents
          .listeners("PAYLOAD:REQUEST")
          .map((listener) => listener({ ctx })),
      );
      await Pipeline.run(ctx);
    });
  }
}
