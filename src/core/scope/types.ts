import type {
  ClientRequest,
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "http";
import type { Phase } from "../../phase/Phase";
import type { Duplex } from "stream";
import type { StateStore } from "../state/StateStore";
import type { WebSocket as NodeWebSocket } from "ws";

/**
 * Contains connection-level information shared across requests handled
 * over the same underlying proxy connection.
 *
 * Provides access to the network stream, protocol metadata, initial
 * connection data, and optional custom TLS certificates.
 */
export type SessionContext = {
  /**
   * Unique identifier assigned to the underlying connection.
   *
   * Useful for correlating logs and tracing requests associated with
   * the same connection, including requests over HTTP keep-alive.
   */
  connectionId: string;

  /**
   * The underlying readable and writable network stream.
   *
   * Represents the connection stream used by the proxy. Its concrete
   * behavior depends on the connection and transport being handled.
   */
  socket: Duplex;

  /** Protocol information detected or established for this connection. */
  protocol: {
    /** Connection protocol, when identified. */
    connectionType?: "tcp" | "http" | "https";

    /** HTTP version associated with the connection, when identified. */
    httpVersion?: "h1" | "h2" | "h3" | "unknown";
  };

  /**
   * Initial data received with the connection, if available.
   *
   * May be used during protocol detection or TLS ClientHello inspection
   * before the proxy commits to a routing decision.
   */
  head?: Buffer | null;

  /**
   * Optional map of domain names to explicitly supplied TLS certificates.
   *
   * When a matching entry is used by the certificate-selection logic,
   * these credentials take precedence over dynamically generated
   * certificates for that domain.
   */
  customCertificates?: Map<
    string,
    { cert: string | Buffer; key: string | Buffer }
  >;
};

/**
 * Contains the data associated with an individual request-response
 * transaction passing through the proxy.
 *
 * Separates client-facing request data, upstream request data, and
 * the target information used for routing. WebSocket-specific metadata
 * is available when the transaction involves an upgrade.
 */
export type RequestContext = {
  /** Unique identifier assigned to this request-response transaction. */
  requestId: string;

  /** Client-facing HTTP request and response information. */
  client: {
    /** Incoming request received from the client, when available. */
    req?: IncomingMessage;

    /** Response object used to send data back to the client, when available. */
    res?: ServerResponse;

    /** HTTP method of the client request, when available. */
    method?: string;

    /** Request URL as received or represented by the proxy. */
    url?: string;

    /** Headers associated with the client request. */
    headers?: IncomingHttpHeaders;
  };

  /** Upstream HTTP request and response information. */
  upstream: {
    /** Outgoing request sent to the upstream server, when available. */
    req?: ClientRequest;

    /** Response received from the upstream server, when available. */
    res?: IncomingMessage;
  };

  /** Original and current destination information for routing. */
  target: {
    /** Original host extracted from the client request, when available. */
    originalHost?: string;

    /** Original URL extracted from the client request, when available. */
    originalUrl?: string;

    /** Current target host used by the proxy, when available. */
    host?: string;

    /** Current target URL used by the proxy, when available. */
    url?: string;
  };

  /**
   * WebSocket-specific state and endpoint references.
   *
   * Present for WebSocket-related transactions when the proxy populates
   * this field; otherwise, it is undefined.
   */
  webSocket?: WebSocketContext;
};

/**
 * Contains WebSocket upgrade state and references to the client-side
 * and upstream WebSocket endpoints.
 *
 * Raw upgrade socket information is also available when applicable.
 */
export type WebSocketContext = {
  /** Indicates whether the WebSocket connection has been upgraded. */
  isUpgraded: boolean;

  /** Negotiated WebSocket subprotocol, when available. */
  subprotocol?: string;

  /** Client-side WebSocket endpoint, when available. */
  client?: NodeWebSocket;

  /** Upstream WebSocket endpoint, when available. */
  upstream?: NodeWebSocket;

  /** Raw socket associated with the client-side upgrade, when available. */
  rawUpgradeSocket?: Duplex;

  /** Unconsumed bytes received alongside the HTTP upgrade request, when available. */
  upgradeHead?: Buffer;
};

/**
 * Tracks request lifecycle metadata and controls request-pipeline execution.
 *
 * Includes the hijack flag, timing information, and internal pipeline
 * execution state.
 */
export type RequestLifecycle = {
  /**
   * Indicates whether the request has been taken over by a handler
   * and should no longer follow the normal pipeline path.
   *
   * @remarks
   * The effect of this flag depends on how the pipeline and handlers
   * interpret it.
   */
  isHijacked: boolean;

  /** Timing measurements collected during request processing. */
  timestamps: {
    /** Timestamp recorded when the request is received. */
    receivedAt: number;

    /** Timestamp recorded when the request is sent upstream, if available. */
    upstreamSentAt?: number;

    /** Timestamp recorded when the upstream response is received, if available. */
    upstreamReceivedAt?: number;

    /** Timestamp recorded when the response is completed, if available. */
    respondedAt?: number;

    /** Total request duration, when calculated. */
    duration?: number;
  };

  /**
   * Identifies the next pipeline phase to execute.
   *
   * @internal
   */
  nextPhase?: Phase;

  /**
   * Internal state store used by proxy handlers and transport logic.
   *
   * @internal
   */
  state: StateStore;
};

/**
 * Root context for processing an individual proxy transaction.
 *
 * Combines the connection-level context, request-level data, and
 * lifecycle information into a single object shared across the
 * proxy's execution pipeline.
 */
export type RequestScope = {
  /**
   * Connection-level context shared across requests associated with
   * the same underlying connection.
   */
  session: SessionContext;

  /**
   * Data associated with the current request-response transaction,
   * including client, upstream, and target information.
   */
  request: RequestContext;

  /**
   * Lifecycle metadata and pipeline execution controls for this transaction.
   */
  lifecycle: RequestLifecycle;
};
