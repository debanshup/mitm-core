import type Stream from "stream";
import type { Socket } from "net";
import type { RequestScope } from "../../scope/types";
import { TypedEventEmitter } from "../EventBus";

/**
 * Defines the comprehensive event lifecycle for the Proxy server.
 * All events utilize a single-payload object pattern to ensure backward compatibility
 * and predictable plugin development.
 */
export interface ProxyEventMap {
  //  tcp / tunneling
  /**
   * Fired when a raw TCP connection is made to the proxy server.
   * This occurs at the transport layer, before any HTTP parsing happens.
   */
  "connection:open": [payload: { socket: Socket }];

  /**
   * Fired when an HTTP `CONNECT` method is received (typically for `https://` or `wss://` traffic).
   * This is the initial handshake requesting a secure tunnel to an upstream host.
   */
  "connect:request": [
    payload: {
      scope: RequestScope;
      // req: http.IncomingMessage;
      socket: Stream.Duplex;
      head: Buffer;
      // payloadEvent: PayloadEvents;
    },
  ];

  /**
   * @todo change this docstring
   * Fired after the ProxyContext is initialized, but immediately before the
   * bidirectional data streams (client <-> proxy <-> upstream) are piped together.
   */
  "connect:before": [
    payload: { scope: RequestScope; socket: Stream.Duplex },
  ];

  /**
   * Fired when the secure tunnel is fully established and data is actively
   * capable of flowing between the client and the destination.
   */
  "connect:established": [
    payload: { scope: RequestScope; socket: Stream.Duplex },
  ];

  // plain http traffic (Unencrypted)

  /**
   * Fired ONLY for standard, unencrypted `http://` traffic.
   * @note This does NOT trigger for `https://` requests. For HTTPS modification,
   * listen to the `https:request` event instead.
   */
  
  "http:request": [
    payload: {
      scope: RequestScope;
      // req: http.IncomingMessage;
      // res: http.ServerResponse;
    },
  ];

  /**
   * Fired when an HTTPS request has been successfully intercepted and decrypted.
   * Hook into this event to read or modify secure request headers, bodies, or routing.
   */
  "https:request": [
    payload: {
      scope: RequestScope;
      // req: http.IncomingMessage;
      // res: http.ServerResponse;
    },
  ];

  /**
   * Fired when the upstream server responds to an intercepted HTTPS request.
   * Hook into this event to inspect or alter the secure response before it is
   * re-encrypted and sent back to the client.
   */
  "response": [payload: { scope: RequestScope }];


  /**
   * Fired when an unhandled exception occurs within the proxy network stack
   * or during the execution of a plugin.
   */
  error: [err: Error | unknown];
}


export const proxyEventManager = new TypedEventEmitter<ProxyEventMap>()