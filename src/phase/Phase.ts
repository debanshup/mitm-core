/**
 * Represents the distinct lifecycle stages within the proxy pipeline.
 *
 * - `tcp`: Initial raw connection handling.
 * - `handshake`: Protocol negotiation (e.g., TLS/SSL).
 * - `request`: Processing of the client request.
 * - `response`: Processing of the upstream response.
 */
export type Phase = "handshake" | "request" | "response" | "tcp";
