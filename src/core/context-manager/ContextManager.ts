import type { Socket } from "net";
import type Stream from "stream";

import crypto from "crypto";
import { StateStore } from "../state/StateStore";
import type { ClientRequest, IncomingMessage, ServerResponse } from "http";
import type { Phase } from "../../phase/Phase";
import type { Duplex } from "stream";

/**
 * The central context object passed through the proxy pipeline.
 * It encapsulates all state, networking objects, and metadata for both
 * the underlying TCP connection and the individual HTTP transactions over it.
 */
export type ProxyContext = {
  /** UUID for the TCP connection; tracks multiplexed requests. */
  connectionId: string;

  /** The underlying duplex stream for the network connection. */
  socket: Duplex;

  /** Initial buffer chunk for protocol sniffing (e.g., TLS ClientHello). */
  head?: any;

  /** Captures socket or handshake level errors. */
  error?: Error;

  /** Current protocol layer: raw 'tcp', plaintext 'http', or decrypted 'https'. */
  connectionType?: "tcp" | "http" | "https";

  /** True if a plugin has taken full control of the lifecycle. */
  isHandled?: boolean;

  /** State scoped strictly to a single HTTP request/response cycle. */
  requestContext: {
    /** UUID for this specific HTTP transaction. */
    requestId: string;

    /** Incoming client request (headers/body). */
    req?: IncomingMessage;

    /** Response stream sent back to the client. */
    res?: ServerResponse;

    /** Outbound request directed to the target server. */
    upstreamReq?: ClientRequest;

    /** Raw response received from the target server. */
    upstreamRes?: IncomingMessage;

    /** Transaction-specific store; cleared when request finishes. */
    state: StateStore;

    /** Target phase for the next middleware execution. */
    nextPhase?: Phase | undefined;
  };

  /** Overrides dynamic MITM certificates for specific domains. */
  customCertificates?: Map<
    string,
    { cert: string | Buffer; key: string | Buffer }
  >;

  /** The host/port the client intended to reach. */
  clientToProxyHost?: string;

  /** The actual destination host the proxy will dial. */
  proxyToUpstreamHost?: string;

  /** The original URL requested by the client. */
  clientToProxyUrl?: string;

  /** The final URL requested upstream (use for decrypted paths). */
  proxyToUpstreamUrl?: string;
};

export class ContextManager {
  private static contextStore = new WeakMap<
    Stream.Duplex | Socket,
    ProxyContext
  >();
  private static idStore = new Map<string, ProxyContext>();
  // track if the socket has a listener
  private static cleanupAttached = new WeakSet<Stream.Duplex | Socket>();

  private static attachCleanup(socket: Stream.Duplex | Socket, id: string) {
    if (!this.cleanupAttached.has(socket)) {
      socket.once("close", () => {
        this.idStore.delete(id);
      });
      this.cleanupAttached.add(socket);
    }
  }

  public static setContext(socket: Stream.Duplex, context: ProxyContext) {
    this.contextStore.set(socket, context);
    if (context.connectionId) {
      this.idStore.set(context.connectionId, context);
      this.attachCleanup(socket, context.connectionId);
    }
  }
  public static getContext(socket: Stream.Duplex) {
    if (!this.contextStore.has(socket)) {
      const connectionId = crypto.randomUUID();
      const context: ProxyContext = {
        connectionId,
        socket,
        requestContext: {
          requestId: crypto.randomUUID(),
          state: new StateStore(), // initialize state store
        },
        customCertificates: new Map(),
      };
      this.contextStore.set(socket, context);
      // secure memory leak
      this.idStore.set(connectionId, context);
    }
    return this.contextStore.get(socket)!;
  }
  /**
   * retrieves a context globally using its connectionId.
   */
  public static getCtxByID(id: string): ProxyContext | undefined {
    return this.idStore.get(id);
  }
}
