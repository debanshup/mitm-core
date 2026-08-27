import type { Socket } from "net";
import type Stream from "stream";
import crypto from "crypto";
import { StateStore } from "../state/StateStore";
import type { IncomingMessage } from "http";
import type {
  SessionContext,
  RequestContext,
  RequestLifecycle,
  RequestScope,
} from "./types";

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

        protocol: {},

        // customCertificates: new Map(),
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
      const context: RequestContext = {
        requestId: crypto.randomUUID(),

        client: {
          req,
          res: req ? (req as any).res : undefined,
          method: req?.method,
          url: req?.url,
          headers: req?.headers,
        },

        upstream: {},

        target: {
          originalUrl: req?.url,
          originalHost: req?.headers.host,
        },
      };

      this.requestIndex.set(requestKey, context);
      sessionContext.socket.once("close", () =>
        // for h1 only
        {
          this.requestIndex.delete(requestKey);
        },
      );

      return context;
    }
  }

  /**
   * Retrieves an existing lifecycle or initializes a fresh one for the request.
   */
  public static getOrCreateRequestLifecycle(
    requestId: string,
  ): RequestLifecycle {
    let lifecycle = this.requestLifeCycleIndex.get(requestId);

    if (!lifecycle) {
      lifecycle = {
        state: new StateStore(),
        isHijacked: false,
        timestamps: {
          receivedAt: Date.now(),
        },
      };

      this.requestLifeCycleIndex.set(requestId, lifecycle);
    }

    return lifecycle;
  }

  public static getOrCreateScope(
    socket: Stream.Duplex | Socket,
    req?: IncomingMessage,
    streamId: string | number = "h1",
  ): RequestScope {
    const session = this.getOrCreateSessionContext(socket);

    const request = this.getOrCreateRequestContext(session, req, streamId);

    const lifecycle = ContextManager.getOrCreateRequestLifecycle(
      request.requestId,
    );

    return {
      session,
      request,
      lifecycle,
    };
  }

  /**
   * CRITICAL: Must be called when the proxy finishes serving the request
   * or when the socket abruptly closes to prevent OOM memory leaks.
   */
  private static destroyRequestLifeCycle(requestId: string): void {
    this.requestLifeCycleIndex.delete(requestId);
  }
}
