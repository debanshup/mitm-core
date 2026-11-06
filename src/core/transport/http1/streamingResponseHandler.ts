import type { IncomingMessage, ClientRequest } from "http";
import type { RequestScope } from "../../scope/types";
import type { ResponseCacheProcessor } from "../../cache/ResponseCacheProcessor";
import { ProxyUtils } from "../../utils/ProxyUtils";
import { ScopeMutator } from "../../scope/ScopeMutator";
import { PassThrough } from "stream";
import { pipeline } from "stream/promises";
import { RES_HOP_HEADERS } from "./responseDispatcher";
import { HeaderResolver } from "../../utils/HeaderResolver";

export class StreamingResponseHandler {
  static async handle(
    scope: RequestScope,
    upstreamRes: IncomingMessage,
    cacheProcessor: ResponseCacheProcessor,
    upstreamReq: ClientRequest,
  ): Promise<void> {
    const res = scope.request.client.res;
    if (!res || res.destroyed || res.writableEnded || !res.writable) {
      if (!upstreamRes.destroyed) upstreamRes.destroy();
      if (!upstreamReq.destroyed) upstreamReq.destroy();
      ScopeMutator.failPipeline(scope);
      return;
    }

    if (!res.headersSent) {
      const rawCleanedHeaders: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (value !== undefined && !RES_HOP_HEADERS.has(key.toLowerCase())) {
          rawCleanedHeaders[key] = value;
        }
      }
      const finalResHeaders = HeaderResolver.resolveResponseHeaders(
        scope,
        rawCleanedHeaders,
      );

      if (finalResHeaders["content-length"] === undefined) {
        finalResHeaders["transfer-encoding"] = "chunked";
      }

      res.writeHead(upstreamRes.statusCode || 200, finalResHeaders);
    }

    const teeStream = new PassThrough({ highWaterMark: 1024 * 1024 });

    teeStream.on("data", (chunk: Buffer) => {
      cacheProcessor.trackChunk(chunk);
    });

    const cleanupSockets = () => {
      ProxyUtils.cleanUp([upstreamReq, upstreamRes]);
    };

    try {
      await pipeline(upstreamRes, teeStream, res);

      try {
        cacheProcessor.commit(upstreamRes);
      } catch (error) {
        console.error("[ResponseCache] Commit failed:", error);
      }

      ScopeMutator.finishPipeline(scope);
    } catch (error: any) {
      const errorCode =
        error && typeof error === "object" && typeof error.code === "string"
          ? error.code
          : "";

      const isExpectedClose =
        errorCode === "ECONNRESET" ||
        errorCode === "EPIPE" ||
        errorCode === "ERR_STREAM_PREMATURE_CLOSE";

      if (!isExpectedClose) {
        console.error(
          "[StreamingResponseHandler] Upstream runtime streaming fault:",
          error,
        );
      }

      cleanupSockets();

      if (!res.writableEnded && !res.destroyed) {
        res.destroy(error);
      }

      throw error;
    }
  }
}
