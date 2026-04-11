import type Stream from "stream";
import type {
  PayloadEvent,
  ProxyContext,
  TlsLifecycleEvent,
} from "../../../types/types.ts";
import http from "http";
import { Proxy } from "../../Proxy.ts";
import type { Socket } from "net";

/**
 * Defines the comprehensive event lifecycle for the Proxy server.
 * All events utilize a single-payload object pattern to ensure backward compatibility
 * and predictable plugin development.
 */
export interface ProxyEventMap  {
  //  tcp / tunneling
  /**
   * Fired when a raw TCP connection is made to the proxy server.
   * This occurs at the transport layer, before any HTTP parsing happens.
   */
  "tcp:connection": [payload: { socket: Socket }];

  /**
   * Fired when an HTTP `CONNECT` method is received (typically for `https://` or `wss://` traffic).
   * This is the initial handshake requesting a secure tunnel to an upstream host.
   */
  "tunnel:connect": [
    payload: {
      req: http.IncomingMessage;
      socket: Stream.Duplex;
      head: Buffer;
      events: { tlsEvent: TlsLifecycleEvent; requestDataEvent: PayloadEvent };
    },
  ];

  /**
   * Fired after the ProxyContext is initialized, but immediately before the
   * bidirectional data streams (client <-> proxy <-> upstream) are piped together.
   */
  "tunnel:pre_establish": [
    payload: { ctx: ProxyContext; socket: Stream.Duplex },
  ];

  /**
   * Fired when the secure tunnel is fully established and data is actively
   * capable of flowing between the client and the destination.
   */
  "tunnel:established": [payload: { ctx: ProxyContext; socket: Stream.Duplex }];

  // plain http traffic (Unencrypted)

  /**
   * Fired ONLY for standard, unencrypted `http://` traffic.
   * @note This does NOT trigger for `https://` requests. For HTTPS modification,
   * listen to the `http:decrypted_request` event instead.
   */
  "http:plain_request": [
    payload: { req: http.IncomingMessage; res: http.ServerResponse },
  ];

  // tls lifecycle

  /**
   * Fired when a local TLS/SNI server is dynamically spun up to intercept
   * secure traffic for a specific target domain.
   */
  "tls:server_created": [payload: { ctx: ProxyContext }];

  /**
   * Fired when a forged "leaf" SSL certificate is successfully generated
   * for the target domain to facilitate Man-In-The-Middle (MITM) decryption.
   */
  "tls:leaf_generated": [payload: { ctx: ProxyContext }];

  // decrypted request (Inside the Tunnel)

  /**
   * Fired when an HTTPS request has been successfully intercepted and decrypted.
   * Hook into this event to read or modify secure request headers, bodies, or routing.
   */
  "http:decrypted_request": [payload: { ctx: ProxyContext }];

  /**
   * Fired when the upstream server responds to an intercepted HTTPS request.
   * Hook into this event to inspect or alter the secure response before it is
   * re-encrypted and sent back to the client.
   */
  decrypted_response: [payload: { ctx: ProxyContext }];

  //  error event

  /**
   * Fired when an unhandled exception occurs within the proxy network stack
   * or during the execution of a plugin.
   */
  error: [err: Error | any];
};
export interface ProxyPlugin {
  name?: string;
  apply: (proxy: Proxy) => void;
}
