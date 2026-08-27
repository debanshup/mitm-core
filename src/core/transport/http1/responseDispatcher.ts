import type { ClientRequest, IncomingMessage } from "http";
import type { RequestScope } from "../../scope/types";
import type { ResponseCacheProcessor } from "../../handlers/utils/ResponseCacheProcessor";
import { StreamingResponseHandler } from "./streamingResponseHandler";
import { ScopeMutator } from "../../scope/ScopeMutator";
const RES_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authenticate",
]);

export class ResponseDispatcher {
  static async handle(
    scope: RequestScope,
    upstreamRes: IncomingMessage,
    cacheProcessor: ResponseCacheProcessor,
    upstream: ClientRequest,
  ) {
    const statusCode = upstreamRes.statusCode ?? 200;

    const isWebSocketUpgrade =
      statusCode === 101 &&
      upstreamRes.headers["upgrade"]?.toLowerCase() === "websocket";

    const isNoContent =
      !isWebSocketUpgrade &&
      (statusCode === 204 ||
        statusCode === 304 ||
        (statusCode >= 100 && statusCode < 200));

    if (isWebSocketUpgrade) {
      // WS handler later
      return;
    }

    if (isNoContent) {
      const res = scope.request.client.res;

      if (res && !res.headersSent && !res.writableEnded) {
        try {
          const cleanedHeaders: Record<string, string | string[]> = {};
          for (const [key, value] of Object.entries(upstreamRes.headers)) {
            if (!value) continue;
            if (!RES_HOP_HEADERS.has(key.toLowerCase())) {
              cleanedHeaders[key] = value;
            }
          }

          res.writeHead(statusCode, cleanedHeaders);
          res.end();
        } catch (err) {
          console.error("[NoContent Handler] Failed to write headers:", err);
          if (!res.destroyed) res.destroy(err as Error);
        }
      }

      if (!upstreamRes.destroyed) upstreamRes.resume(); // drain any trailers
      ScopeMutator.finishPipeline(scope);
      return;
    }
    try {
      await StreamingResponseHandler.handle(
        scope,
        upstreamRes,
        cacheProcessor,
        upstream,
      );
    } catch (error) {
      console.error(
        `[Dispatcher Error Capture] Stream routing failed:`,
        error,
        "| target:",
        scope.request.target.originalUrl,
      );

      ScopeMutator.failPipeline(scope, error as Error);
    }
  }
}
