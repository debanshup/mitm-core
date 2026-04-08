connectionEvents;
import { ContextManager } from "../core/context-manager/ContextManager.ts";
import Pipeline from "../core/pipelines/PipelineCompiler.ts";
import { Phase } from "../phase/Phase.ts";
import { STATE } from "../core/state/state.ts";
import { ProxyUtils } from "../core/utiils/ProxyUtils.ts";
import { connectionEvents } from "../core/event-manager/connection-events/connectionEvents.ts";
import { payloadEvents } from "../core/event-manager/data-events/payloadEvents.ts";
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
    }
    Pipeline.compile();
    connectionEvents.on("TCP", ({ socket }) => {
      // disable nagle's at tcp level
      socket.setNoDelay(true);
      const ctx = ContextManager.getContext(socket);
      ctx.connectionState.set("conn", "tcp");

      socket.on("error", async (err: any) => {
        ProxyUtils.cleanUp([socket]);
        ctx.error = err;
        if (ctx.requestContext) {
          ctx.requestContext.state.set(STATE.is_error, true);
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
          ctx.requestContext.state.set(STATE.is_finished, true);
        }
      });
    });
    connectionEvents.on("HTTP:PLAIN", async ({ req, res }) => {
      const ctx = ContextManager.getContext(req.socket);
      ctx.connectionType = "http";
      ctx.requestContext!.req = req;
      ctx.requestContext!.res = res;
      ctx.requestContext.nextPhase = Phase.REQUEST;
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
      ctx.head = head;
      ctx.requestContext!.req = req;
      ctx.requestContext.nextPhase = Phase.HANDSHAKE;

      const { host, url } = parseConnectData(req);
      ctx.clientToProxyHost = host;
      ctx.clientToProxyUrl = url;

      // run pipeline
      await Pipeline.run(ctx);
    });

    connectionEvents.on("HTTP:DECRYPTED", async ({ ctx }) => {
      // console.info("dec https fired!")
      const { host, path, fullUrl } = parseHttpRequestData(
        ctx.requestContext.req!,
        true,
      );

      // console.info(host, fullUrl)

      ctx.proxyToUpstreamHost = host;
      ctx.proxyToUpstreamUrl = fullUrl;
      ctx.requestContext.nextPhase = Phase.REQUEST;
      await Promise.all(
        payloadEvents
          .listeners("PAYLOAD:REQUEST")
          .map((listener) => listener({ ctx })),
      );
      await Pipeline.run(ctx);
    });
  }
}
