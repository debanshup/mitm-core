import type { IncomingMessage, ClientRequest } from "http";
import type { RequestScope } from "../../scope/types";
import type { ResponseCacheProcessor } from "../../cache/ResponseCacheProcessor";
import { ProxyUtils } from "../../utils/ProxyUtils";
import { ScopeMutator } from "../../scope/ScopeMutator";
import { PassThrough } from "stream";
import { pipeline } from "stream/promises";

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
      ScopeMutator.failPipeline(
        scope,
        new Error(
          "ERR_STREAM_PREMATURE_CLOSE: Client disconnected before streaming initialization",
        ),
      );
      return;
    }

    if (!res.headersSent) {
      res.writeHead(upstreamRes.statusCode || 200, upstreamRes.headers);
    }

    const teeStream = new PassThrough();

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

      ScopeMutator.failPipeline(scope, error);

      if (!res.writableEnded && !res.destroyed) {
        res.destroy(error);
      }

      throw error;
    }
  }
}
