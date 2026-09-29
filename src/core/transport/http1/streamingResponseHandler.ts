import type { IncomingMessage, ClientRequest } from "http";
import type { RequestScope } from "../../scope/types";
import type { ResponseCacheProcessor } from "../../cache/ResponseCacheProcessor";
import { ProxyUtils } from "../../utils/ProxyUtils";
import { ScopeMutator } from "../../scope/ScopeMutator";
import { PassThrough } from "stream";
import { pipeline } from "stream/promises";
import { RES_HOP_HEADERS } from "./responseDispatcher";

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
     const cleanedHeaders: Record<string, string | string[]> = {};
     for (const [key, value] of Object.entries(upstreamRes.headers)) {
       if (value !== undefined && !RES_HOP_HEADERS.has(key.toLowerCase())) {
         cleanedHeaders[key] = value;
       }
     }
     res.writeHead(upstreamRes.statusCode || 200, cleanedHeaders);
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

      cacheProcessor.commit(upstreamRes);
      cleanupSockets();
      ScopeMutator.finishPipeline(scope);
    } catch (error: any) {
      cleanupSockets();

      const errorCode = error.code ?? "";
      if (
        !["ECONNRESET", "EPIPE", "ERR_STREAM_PREMATURE_CLOSE"].includes(
          errorCode,
        )
      ) {
        console.error(
          "[StreamingResponseHandler] Upstream runtime streaming fault:",
          error,
        );
      }

      ScopeMutator.failPipeline(scope);

      if (!res.writableEnded && !res.destroyed) {
        res.destroy(error);
      }

      throw error;
    }
  }
}
