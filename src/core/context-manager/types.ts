
import type { ClientRequest, IncomingMessage, ServerResponse } from "http";
import type { Phase } from "../../phase/Phase";
import type { Duplex } from "stream";
import type { StateStore } from "../state/StateStore";











/**
 * The core context entity passed throughout the entire proxy execution pipeline.
 *
 * It encapsulates connection-level metadata, low-level networking streams, and
 * transactional states for both raw TCP streams and high-level HTTP protocol layers.
 */
export type SessionContext = {
  /**
   * @type {string} A unique identifier (UUID) assigned to the raw TCP connection.
   * Essential for telemetry, structured logging, and tracking concurrent
   * HTTP requests multiplexed over a single keep-alive session.
   */
  connectionId: string;

  /**
   * @type {Duplex} The underlying readable/writable duplex network stream.
   */
  socket: Duplex;

  /**
   * @type {Buffer | any} The initial slice of data read from the socket immediately upon connection.
   * Used primarily for zero-byte protocol sniffing (e.g., parsing a TLS `ClientHello`
   * to extract the SNI before committing to a routing decision).
   */
  head?: any;

  /**
   * @type {Error} Tracks connection-level or socket-level exceptions.
   * Captures events like `ECONNRESET`, client hang-ups, or TLS handshake failures.
   */
  error?: Error;

  /**
   * @type {"tcp" | "http" | "https"} The evaluated protocol layer handling this connection.
   * - `tcp`: Raw, unparsed TCP passthrough tunnel.
   * - `http`: Plaintext HTTP/1.x or HTTP/2 message stream.
   * - `https`: An actively intercepted, decrypted, and re-encrypted TLS tunnel (MITM).
   */
  connectionType?: "tcp" | "http" | "https";

  /**
   * @type {"h1" | "h2" | "h3" | "unknown"} The specific application-layer protocol version negotiated.
   */
  httpVersion?: "h1" | "h2" | "h3" | "unknown";

  /**
   * @type {Map<string, { cert: string | Buffer; key: string | Buffer }>}
   * An optional registry mapping target domains to pre-loaded, static TLS credentials.
   *
   * ⚠️ If a domain exists in this map, the proxy bypasses its dynamic, worker-driven
   * leaf certificate generator and uses these explicit certificates for MITM negotiation instead.
   */
  customCertificates?: Map<
    string,
    { cert: string | Buffer; key: string | Buffer }
  >;
};

/**
 * The transactional context object created for every individual HTTP request-response lifecycle.
 *
 * It encapsulates downstream client payloads, upstream network descriptors, and
 * intermediate routing metadata generated during request parsing and mutation.
 */
export type RequestContext = {
  /**
   * @type {string} A unique identifier (UUID) assigned to this specific HTTP transaction.
   */
  requestId: string;

  /**
   * @type {string} The tracking identifier of the parent TCP/TLS session handling this transaction.
   * Essential for tracing multiplexed HTTP/2 streams or pipelined HTTP/1.1 connections back to their origin socket.
   */
  connectionId: string;

  // --- Core Downstream HTTP Objects ---

  /**
   * @type {IncomingMessage} The raw incoming request payload stream received directly from the client.
   */
  req?: IncomingMessage;

  /**
   * @type {ServerResponse} The active downstream server response object bound back to the client.
   */
  res?: ServerResponse;

  // --- Core Upstream HTTP Objects ---

  /**
   * @type {ClientRequest} The outgoing request descriptor initiated by the proxy toward the destination server.
   */
  upstreamReq?: ClientRequest;

  /**
   * @type {IncomingMessage} The incoming response payload stream received back from the destination server.
   */
  upstreamRes?: IncomingMessage;

  // --- Request Details ---

  /**
   * @type {string} The HTTP verb (e.g., "GET", "POST") extracted from the incoming request.
   */
  requestMethod?: string;

  /**
   * @type {string} The target endpoint path or absolute URL string found within the client request line.
   */
  requestUrl?: string;

  /**
   * @type {Record<string, string | string[] | undefined>} The raw dictionary of headers provided by the client.
   */
  requestHeaders?: Record<string, string | string[] | undefined>;

  /**
   * @type {any} A sanitized or normalized copy of the client request headers, modified for downstream safety.
   */
  sanitizedHeaders?: any;

  /**
   * @type {any} The captured payload body of the client request.
   * Format varies (string, Buffer, or parsed JSON) depending on which parsing middleware has executed.
   */
  requestBody?: any;

  // --- Response Details ---

  /**
   * @type {object} The status envelope representing the final execution outcome of the HTTP call.
   */
  status?: {
    statusCode?: number;
    statusText?: string;
  };

  /**
   * @type {Record<string, string | string[] | undefined>} The dictionary of headers to be returned to the client.
   */
  responseHeaders?: Record<string, string | string[] | undefined>;

  /**
   * @type {any} The captured payload body returned by the upstream target.
   * Format varies (string, Buffer, or object) depending on inspection, logging, or caching parameters.
   */
  responseBody?: any;

  // --- Routing & Targeting Metadata ---

  /**
   * @type {string} The target address (domain/IP) and port the client believes it is addressing.
   * Typically derived from the original HTTP 'Host' header or the initial 'CONNECT' target line.
   */
  clientToProxyHost?: string;

  /**
   * @type {string} The actual target address and port the proxy connects to in order to resolve the payload.
   * This can deviate from 'clientToProxyHost' if routing middleware rewrite rules are applied.
   */
  proxyToUpstreamHost?: string;

  /**
   * @type {string} The unmodified origin URL exactly as received by the proxy interface.
   */
  clientToProxyUrl?: string;

  /**
   * @type {string} The terminal, potentially mutated URL string that the proxy dispatches to the upstream server.
   *
   * ARCHITECTURAL INTENT:
   * This property must be referenced when evaluating or intercepting URLs on decrypted SSL/TLS tunnels.
   */
  proxyToUpstreamUrl?: string;
};

/**
 * Represents the end-to-end context and control state of an individual
 * HTTP/HTTPS transaction passing through the MITM proxy engine.
 */
export type RequestLifecycle = {
  /**
   * @type {StateStore}
   * The centralized operational state store bound to this specific request-response loop.
   */
  state: StateStore;

  /**
   * @type {Phase | undefined}
   * Explicitly instructs the proxy engine to short-circuit the standard sequential flow
   * and jump directly to a target phase (e.g., skipping the upstream server).
   */
  nextPhase?: Phase | undefined;

  /**
   * @type {boolean}
   * Indicates if an active middleware has intercepted the cycle, halting default
   * upstream processing to serve a custom or mocked response directly to the client.
   */
  isHijacked: boolean;

  /**
   * @type {object}
   * High-resolution Unix epoch timestamps (in milliseconds) used to audit latency and
   * track performance metrics across the lifecycle.
   */
  timestamps: {
    /** @type {number} Time when the proxy received the initial downstream client request. */
    receivedAt: number;

    /** @type {number | undefined} Time when the proxy finished forwarding the request upstream. */
    upstreamSentAt?: number;

    /** @type {number | undefined} Time when the proxy started receiving the upstream server's response. */
    upstreamReceivedAt?: number;

    /** @type {number | undefined} Time when the proxy finished flushing the final byte back to the client. */
    respondedAt?: number;

    /** @type {number | undefined} Total execution duration of the transaction in milliseconds. */
    duration?: number;
  };
};

/**
 * The root execution boundary and dependency injection container for a single transaction.
 * It provides middleware and core routing engines with unified access to connection telemetry,
 * HTTP transactional payloads, and the active state machine of the request loop.
 */
export type RequestScope = {
  /**
   * @type {SessionContext}
   * The long-lived network socket context that persists across multiple sequential requests
   */
  sessionContext: SessionContext;

  /**
   * @type {RequestContext}
   * The transient, isolated data structure representing the current HTTP transaction's payload,
   * containing mutable headers, request/response bodies, URI paths, and HTTP methods.
   */
  requestContext: RequestContext;

  /**
   * @type {RequestLifecycle}
   * The active operational state engine and performance monitor controlling the execution flow
   * of the proxy loop, enabling short-circuiting, phase jumps, and latency audits.
   */
  lifecycle: RequestLifecycle;
};
