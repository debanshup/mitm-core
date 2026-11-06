import https from "https";
import http, { ClientRequest } from "http";
import { pipeline } from "stream";
import type { RequestScope } from "../../scope/types";
import { pluginEventManager } from "../../event/plugin-events/pluginEvents";
import { getConfig } from "../../../config.registry";
import { reportProxyError } from "../../event/proxy-events/proxyEvents";
import { PipelineAbortSignal } from "../../signals/pipelineAbortSignal";
import { HeaderResolver } from "../../utils/HeaderResolver";

export class UpstreamInitiator {
  private static httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 5000,
    maxSockets: 1024,
    maxFreeSockets: 256,
    scheduling: "fifo",
    timeout: 60000,
    rejectUnauthorized: false,
    checkServerIdentity: () => undefined,
  });

  private static httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 5000,
    maxSockets: 1024,
    maxFreeSockets: 256,
    scheduling: "fifo",
    timeout: 60000,
  });

  private static upstreamRequestEvents = new WeakMap<
    ClientRequest,
    Promise<void>
  >();

  public static waitForUpstreamRequestEvent(
    upstreamReq: ClientRequest,
  ): Promise<void> {
    return this.upstreamRequestEvents.get(upstreamReq) ?? Promise.resolve();
  }

  private static upstreamConnectEvents = new WeakMap<
    ClientRequest,
    Promise<void>
  >();

  public static waitForUpstreamConnectEvent(
    upstreamReq: ClientRequest,
  ): Promise<void> {
    return this.upstreamConnectEvents.get(upstreamReq) ?? Promise.resolve();
  }

  public static async initH1UpstreamReq(targetUrl: URL, scope: RequestScope) {
    const { request } = scope;
    const clientReq = request.client.req;

    if (!clientReq) {
      throw new Error("Client request is missing");
    }

    const isHTTPS = targetUrl.protocol === "https:";
    const requestModule = isHTTPS ? https : http;
    const agent = isHTTPS ? this.httpsAgent : this.httpAgent;

    let upstream: ClientRequest;

    try {
      scope.lifecycle.timestamps.upstreamSentAt = Date.now();

      const baseHeaders = HeaderResolver.resolveRequestHeaders(scope);
      baseHeaders["host"] = targetUrl.host;
      baseHeaders["connection"] = "keep-alive";

      upstream = requestModule.request({
        host: targetUrl.hostname,
        port: targetUrl.port || (isHTTPS ? 443 : 80),
        servername: isHTTPS ? targetUrl.hostname : undefined,
        method: clientReq.method,
        path: targetUrl.pathname + targetUrl.search,
        headers: baseHeaders,
        agent,
        timeout: getConfig().upstreamTimeoutMs,
        maxHeaderSize: 128 * 1024,
      });
    } catch (syncError) {
      console.error(
        "[Outbound Bridge Critical] Synchronous request instantiation failed:",
        syncError,
      );

      clientReq.destroy();
      this.handleUpstreamFailure(syncError as Error, scope, targetUrl);

      throw syncError;
    }

    let resolveConnect!: () => void;
    let rejectConnect!: (error: unknown) => void;

    const connectEventPromise = new Promise<void>((resolve, reject) => {
      resolveConnect = resolve;
      rejectConnect = reject;
    });

    void connectEventPromise.catch(() => {});

    this.upstreamConnectEvents.set(upstream, connectEventPromise);

    // Disable Nagle's algorithm for lower latency.
    upstream.setNoDelay(true);

    let clientDisconnected = false;
    let cleanedUp = false;

    // NEW: Track request lifecycle.
    let requestPipelineStarted = false;
    let upstreamFailed = false;
    let pipelineAborted = false;

    const clientSocket = clientReq.socket;

    const onClientDisconnect = () => {
      if (scope.lifecycle.isHijacked) return;

      if (clientDisconnected) return;

      clientDisconnected = true;

      if (!upstream.destroyed) {
        upstream.destroy();
      }
      // remove remaining lifecycle listeners
      cleanupClientListeners();
    };

    const onClientAborted = () => {
      if (!clientReq.readableEnded) {
        onClientDisconnect();
      }
    };

    const onClientResponseClose = () => {
      if (!request.client.res?.writableEnded) {
        onClientDisconnect();
      }
    };

    const cleanupClientListeners = () => {
      if (cleanedUp) return;

      cleanedUp = true;

      clientSocket?.removeListener("close", onClientDisconnect);
      clientReq.removeListener("aborted", onClientAborted);

      request.client.res?.removeListener("close", onClientResponseClose);

      request.client.res?.removeListener("finish", cleanupClientListeners);
      request.client.res?.removeListener("close", cleanupClientListeners);
    };

    clientSocket?.once("close", onClientDisconnect);
    clientReq.once("aborted", onClientAborted);

    request.client.res?.once("close", onClientResponseClose);
    request.client.res?.once("finish", cleanupClientListeners);
    request.client.res?.once("close", cleanupClientListeners);

    // Handle errors occurring before pipeline startup.
    const onPrePipelineError = (err: Error) => {
      if (
        requestPipelineStarted ||
        clientDisconnected ||
        pipelineAborted ||
        scope.lifecycle.isHijacked
      ) {
        return;
      }

      if (upstreamFailed) return;

      upstreamFailed = true;

      reportProxyError(err);
      this.handleUpstreamFailure(err, scope, targetUrl);
    };

    upstream.once("error", onPrePipelineError);

    // Start forwarding only after the connect event completes.
    const startRequestPipeline = () => {
      if (
        requestPipelineStarted ||
        upstreamFailed ||
        clientDisconnected ||
        upstream.destroyed
      ) {
        return;
      }

      requestPipelineStarted = true;

      upstream.removeListener("error", onPrePipelineError);

      pipeline(clientReq, upstream, (err) => {
        if (!err) return;

        const errCode = (err as NodeJS.ErrnoException).code;

        if (clientDisconnected || errCode === "ERR_UPSTREAM_TIMEOUT") {
          return;
        }

        if (
          errCode !== "ERR_STREAM_PREMATURE_CLOSE" &&
          errCode !== "ERR_CLIENT_DISCONNECTED"
        ) {
          reportProxyError(err);

          console.error(
            "Pipeline mapping failed from client to upstream:",
            err,
          );

          this.handleUpstreamFailure(err, scope, targetUrl);
        }
      });
    };

    const dispatchUpstreamConnect = async () => {
      try {
        await pluginEventManager.emitAsync("proxy:upstream-connect", { scope });

        if (scope.lifecycle.isHijacked) {
          resolveConnect();
          return;
        }

        if (upstreamFailed || upstream.destroyed) {
          resolveConnect();
          return;
        }

        startRequestPipeline();
        resolveConnect();
      } catch (error) {
        if (error instanceof PipelineAbortSignal) {
          pipelineAborted = true;
          rejectConnect(error);
          upstream.destroy();
          return;
        }

        resolveConnect();
        reportProxyError(error);
        upstream.destroy();
      }
    };

    upstream.once("socket", (socket) => {
      if (socket.connecting) {
        const connectEvent = isHTTPS ? "secureConnect" : "connect";

        socket.once(connectEvent, () => {
          void dispatchUpstreamConnect();
        });
      } else {
        setImmediate(() => {
          void dispatchUpstreamConnect();
        });
      }
    });

    upstream.once("finish", () => {
      const eventPromise = pluginEventManager.emitAsync(
        "proxy:upstream-request",
        { scope },
      );

      this.upstreamRequestEvents.set(upstream, eventPromise);

      // Prevent an unhandled rejection before the response awaits it.
      void eventPromise.catch(() => {});
    });

    return upstream;
  }

  /**
   * Unified Pipeline Failure/Error Reporting Logic
   */
  private static handleUpstreamFailure(
    err: Error,
    scope: RequestScope,
    targetUrl: URL,
  ): void {
    const { request } = scope;

    console.error(
      `[Stream Error] Upstream Pathway Fault: ${err.message} | host: ${targetUrl.host}`,
    );

    const res = request.client.res;

    if (res && !res.headersSent && !res.writableEnded) {
      res.statusCode = 502;
      res.end("Bad Gateway");
    }
  }
}
