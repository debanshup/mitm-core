import type { Socket } from "net";
import type Stream from "stream";
import crypto from "crypto";
import { StateStore } from "../state/StateStore";
import type { IncomingMessage } from "http";
import type { SessionContext, RequestContext, RequestLifecycle } from "./types";


export class ContextManager {
  private static contextStore = new WeakMap<
    Stream.Duplex | Socket,
    SessionContext
  >();

  // connection index
  private static connectionIndex = new Map<string, SessionContext>();
  //  request index
  private static requestIndex = new Map<string, RequestContext>();
  // lifecycle index
  private static requestLifeCycleIndex = new Map<string, RequestLifecycle>();

  private static getRequestKey(
    connectionId: string,
    streamId: string | number = "h1",
  ): string {
    return `${connectionId}:${streamId}`;
  }

  public static setContext(
    socket: Stream.Duplex | Socket,
    context: SessionContext,
  ) {
    this.contextStore.set(socket, context);

    this.connectionIndex.set(context.connectionId, context);
  }

  public static getOrCreateSessionContext(
    socket: Stream.Duplex | Socket,
  ): SessionContext {
    let ctx = this.contextStore.get(socket);

    if (!ctx) {
      ctx = {
        connectionId: crypto.randomUUID(),

        socket,

        customCertificates: new Map(),
      } as SessionContext;

      this.contextStore.set(socket, ctx);

      this.connectionIndex.set(ctx.connectionId, ctx);

      const cleanup = () => {
        // console.info("clean up root ctx");
        this.connectionIndex.delete(ctx!.connectionId);
      };

      socket.once("close", cleanup);
      socket.once("error", cleanup);
    }

    return ctx;
  }

  public static getProxyCtxByID(id: string): SessionContext | undefined {
    return this.connectionIndex.get(id);
  }

  public static removeContext(socket: Stream.Duplex | Socket) {
    const ctx = this.contextStore.get(socket);

    if (ctx) {
      this.connectionIndex.delete(ctx.connectionId);
    }
  }
  /**
   * Instantiates a comprehensive RequestContext when an HTTP (h1) transaction starts,
   * matching standard request structures and mapping telemetry markers.
   */
  public static getOrCreateRequestContext(
    sessionContext: SessionContext,
    req?: IncomingMessage,
    streamId: string | number = "h1",
  ): RequestContext {
    const requestKey = this.getRequestKey(
      sessionContext.connectionId,
      streamId,
    );

    const existingContext = this.requestIndex.get(requestKey);

    if (existingContext) {
      return existingContext;
    } else {
      const headers = req?.headers;
      let sanitized: Record<string, any> | undefined = undefined;

      if (headers) {
        sanitized = { ...headers };
        delete sanitized["proxy-authorization"];
        delete sanitized["proxy-connection"];
      }

      const requestContext = {
        requestId: crypto.randomUUID(),
        connectionId: sessionContext.connectionId,
        req,
        res: req ? (req as any).res : undefined,
        requestMethod: req?.method,
        requestUrl: req?.url, // fallback
        requestHeaders: headers,
        sanitizedHeaders: sanitized,
        state: new StateStore(),
        timestamps: {
          receivedAt: Date.now(),
        },
      };

      // cleanup
      this.requestIndex.set(requestKey, requestContext);
      sessionContext.socket.once("close", () =>
        // for h1 only
        {
          this.requestIndex.delete(requestKey);
        },
      );

      return requestContext;
    }
  }

  /**
   * Retrieves an existing lifecycle or initializes a fresh one for the request.
   */
  public static getOrCreateRequestLifeCycle(
    requestId: string,
  ): RequestLifecycle {
    let lifecycle = this.requestLifeCycleIndex.get(requestId);

    if (!lifecycle) {
      lifecycle = {
        state: new StateStore(), // Assuming StateStore is a class/constructor
        isHijacked: false,
        timestamps: {
          receivedAt: Date.now(),
        },
        // currentPhase and nextPhase remain undefined initially
      };

      this.requestLifeCycleIndex.set(requestId, lifecycle);
      this.destroyRequestLifeCycle(requestId);
    }

    return lifecycle;
  }

  /**
   * CRITICAL: Must be called when the proxy finishes serving the request
   * or when the socket abruptly closes to prevent OOM memory leaks.
   */
  private static destroyRequestLifeCycle(requestId: string): void {
    this.requestLifeCycleIndex.delete(requestId);
  }
}
