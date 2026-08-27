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

  protocol: {
    connectionType?: "tcp" | "http" | "https";
    httpVersion?: "h1" | "h2" | "h3" | "unknown";
  };

  /**
   * @type {Buffer | any} The initial slice of data read from the socket immediately upon connection.
   * Used primarily for zero-byte protocol sniffing (e.g., parsing a TLS `ClientHello`
   * to extract the SNI before committing to a routing decision).
   */
  head?: Buffer | null;

  /**
   * @type {Error} Tracks connection-level or socket-level exceptions.
   * Captures events like `ECONNRESET`, client hang-ups, or TLS handshake failures.
   */
  error?: Error;

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

  client: {
    req?: IncomingMessage;
    res?: ServerResponse;

    method?: string;
    url?: string;
    headers?: IncomingHttpHeaders;
  };

  upstream: {
    req?: ClientRequest;
    res?: IncomingMessage;
  };

  target: {
    originalHost?: string;
    originalUrl?: string;

    host?: string;
    url?: string;
  };

  /**
   * Complete lifecycle, state, and socket metadata for active WebSocket tunnels.
   * This object remains undefined for standard REST/HTTP transactional streams.
   */
  webSocket?: WebSocketContext;

  mock?: {
    statusCode: number;
    headers?: Record<string, string | string[]>;
    body?: Buffer | string;
  };
};

export type WebSocketContext = {
  isUpgraded: boolean;
  subprotocol?: string;

  client?: NodeWebSocket;
  upstream?: NodeWebSocket;

  rawUpgradeSocket?: Duplex;
  upgradeHead?: Buffer;
};

/**
 * Represents the end-to-end context and control state of an individual
 * HTTP/HTTPS transaction passing through the MITM proxy engine.
 */
export type RequestLifecycle = {
  state: StateStore;
  nextPhase?: Phase;
  isHijacked: boolean;

  timestamps: {
    receivedAt: number;
    upstreamSentAt?: number;
    upstreamReceivedAt?: number;
    respondedAt?: number;
    duration?: number;
  };
};

export type BodyTransform = (
  body: Buffer,
  scope: RequestScope,
) => Buffer | Promise<Buffer>;

export class TransformPipeline {
  private transforms: BodyTransform[] = [];

  use(transform: BodyTransform): void {
    this.transforms.push(transform);
  }

  async execute(body: Buffer, scope: RequestScope): Promise<Buffer> {
    let result = body;

    for (const transform of this.transforms) {
      result = await transform(result, scope);
    }

    return result;
  }

  get size(): number {
    return this.transforms.length;
  }
}

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
  session: SessionContext;

  /**
   * @type {RequestContext}
   * The transient, isolated data structure representing the current HTTP transaction's payload,
   * containing mutable headers, request/response bodies, URI paths, and HTTP methods.
   */
  request: RequestContext;

  /**
   * @type {RequestLifecycle}
   * The active operational state engine and performance monitor controlling the execution flow
   * of the proxy loop, enabling short-circuiting, phase jumps, and latency audits.
   */
  lifecycle: RequestLifecycle;
};
