import { ContextManager } from "../core/context-manager/ContextManager.ts";
import Pipeline from "../core/pipelines/PipelineCompiler.ts";
import { ProxyUtils } from "../core/utils/ProxyUtils.ts";
import { connectionEvents } from "../core/event-manager/connection-events/connectionEvents.ts";
import { payloadEvents } from "../core/event-manager/payload-events/payloadEvents.ts";
import {
  parseConnectData,
  parseHttpRequestData,
} from "../utils/parser/parseReqData.ts";

export class Middleware {
  public static register({
    initializePipelines,
  }: {
    initializePipelines: boolean;
  }) {
    if (initializePipelines) {
      Pipeline.compile();
    }
    connectionEvents.on("TCP", ({ socket }) => {
      // disable nagle's at tcp level
      socket.setNoDelay(true);
      const ctx = ContextManager.getContext(socket);
      socket.on("error", async (err: any) => {
        ProxyUtils.cleanUp([socket]);
        ctx.error = err;
        if (ctx.requestContext) {
          ctx.requestContext.state.set("error", true);
        }
        const isExpectedDrop =
          err.code === "ECONNABORTED" ||
          err.code === "ECONNRESET" ||
          err.code === "EPIPE";

        if (!isExpectedDrop) {
          console.error(
            `[TCP_CLIENT_ERROR] ${err.code || "UNKNOWN"}:`,
            err.message,
          );
        }
      });

      socket.on("close", () => {
        ProxyUtils.cleanUp([socket]);
        if (ctx.requestContext) {
          ctx.requestContext.state.set("isFinished", true);
        }
      });
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
