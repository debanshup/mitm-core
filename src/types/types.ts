import type { ClientRequest, IncomingMessage, ServerResponse } from "http";
import type { STATE } from "../core/state/state.ts";
import type { Phase } from "../phase/Phase.ts";
import type Stream from "stream";
import type { tlsLifecycleEvents } from "../core/event-manager/tls-events/tlsLifecycleEvents.ts";
import type { connectionEvents } from "../core/event-manager/connection-events/connectionEvents.ts";
import type { payloadEvents } from "../core/event-manager/data-events/payloadEvents.ts";
import type { pipelineEvents } from "../core/event-manager/pipeline-events/pipelineEvents.ts";
import type { PipelineAbortSignal } from "../core/signals/pipelineAbortSignal.ts";

/**
 * The central context object passed through the proxy pipeline.
 * It encapsulates all state, networking objects, and metadata for both
 * the underlying TCP connection and the individual HTTP transactions over it.
 */
export type ProxyContext = {
  /** * A unique identifier (e.g., UUID) for the underlying TCP connection.
   * Highly useful for tracing logs, especially when multiple HTTP requests
   * are multiplexed over a single keep-alive connection.
   */
  connectionId: string;

  /** * The initial payload/buffer chunk received immediately upon connection.
   * Often used for protocol sniffing (e.g., peeking at a TLS `ClientHello`
   * before deciding how to route the socket).
   */
  head?: any;

  /** * Captures any connection-level or socket-level error that occurs
   * (e.g., socket hang up, ECONNRESET, or TLS handshake failures).
   */
  error?: Error;

  /** * A key-value store for persisting arbitrary developer data across the
   * entire lifespan of the TCP connection. This state survives across
   * multiple HTTP transactions on the same socket.
   */
  connectionState: Map<string, any>;

  /** * Indicates the parsed protocol layer of the current connection.
   * - `tcp`: Unparsed or raw passthrough socket.
   * - `http`: Plaintext HTTP connection.
   * - `https`: A successfully intercepted and decrypted TLS tunnel.
   */
  connectionType?: "tcp" | "http" | "https";
  /** flag to indiicate if the whole process is handled by other plug-in
   *
   */
  isHandled?: boolean;

  /** * Encapsulates all state, objects, and metadata specific to a single
   * HTTP request/response cycle.
   */
  requestContext: {
    /** * Unique identifier for this specific HTTP transaction. Useful for
     * correlating a client's incoming request with the upstream response.
     */
    requestId: string;

    /** * The incoming HTTP request object from the original client.
     * Used to read client headers, methods, and body data.
     */
    req?: IncomingMessage;

    /** * The HTTP response object destined to be sent back to the client.
     * Used to intercept and modify the final output before the client sees it.
     */
    res?: ServerResponse;

    /** * The proxy's outbound HTTP request object directed to the target server.
     * Used to modify headers or payloads before they leave the proxy.
     */
    upstreamReq?: ClientRequest;

    /** * The raw HTTP response received by the proxy from the target server.
     * Used to read the original upstream headers, status codes, and body.
     */
    upstreamRes?: IncomingMessage;

    /** * A key-value store for persisting data strictly scoped to this single
     * HTTP transaction. This is cleared once the request finishes.
     */
    state: Map<State | string, any>;

    /** * An internal flag indicating the next operational stage in the
     * proxy's middleware pipeline.
     */
    nextPhase?: Phase | undefined;
  };

  /**
   * Map of domains to custom TLS certificates. If populated for a specific host,
   * the proxy will use these exact credentials for MITM decryption instead
   * of generating leaf certificates dynamically.
   * * @important Change only if needed. Overrides default dynamic certificate generation.
   */
  customCertificates?: Map<
    string,
    { cert: string | Buffer; key: string | Buffer }
  >;

  /** * The host address (domain/IP) and port the client *thinks* it is communicating with.
   * Derived from the original HTTP `Host` header or the `CONNECT` target.
   */
  clientToProxyHost?: string;

  /** * The actual host address and port the proxy connects to in order to fetch the response.
   * This can differ from `clientToProxyHost` if the proxy alters the routing destination.
   */
  proxyToUpstreamHost?: string;

  /** * The original URL requested by the client, exactly as received by the proxy.
   */
  clientToProxyUrl?: string;

  /**
   * The final, potentially modified URL that the proxy will request from the upstream server.
   * * @important Access this for decrypted URLs as well.
   */
  proxyToUpstreamUrl?: string;
};

export type State = (typeof STATE)[keyof typeof STATE];
export type Destroyable<T extends Stream> = T & {
  destroyed?: boolean;
  destroy: (error?: Error) => void;
  end?: () => void;
};
export type Handler = {
  phase: Phase;
  handle(ctx: ProxyContext): Promise<void>;
};

export type CachedResponse = {
  status: number;
  etag?: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  expires: number;
};
export type Plugin = {
  name: string;
  phase: Phase;
  order: number;
  execute(ctx: ProxyContext): Promise<void>;
  register(): void;
  unregister(): void;
  isRegistered(): boolean;
};

export type TlsLifecycleEvent = typeof tlsLifecycleEvents;
export type ConnectionEvent = typeof connectionEvents;
export type PayloadEvent = typeof payloadEvents;
export type PipelineEvent = typeof pipelineEvents;