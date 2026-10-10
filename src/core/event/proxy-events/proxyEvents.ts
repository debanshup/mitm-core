import type Stream from "stream";
import type { Socket } from "net";
import type { RequestScope } from "../../scope/types";
import { TypedEventEmitter } from "../EventBus";

/**
 * Defines the events emitted by the proxy throughout its connection
 * and request lifecycle.
 *
 * Each event maps to a tuple describing its emitted arguments. Events
 * that carry structured data use a single payload object.
 */
export interface ProxyEventMap {
  // TCP connections and tunneling

  /**
   * Fired when a client establishes a raw TCP connection to the proxy.
   *
   * Occurs at the transport layer, before HTTP request parsing.
   */
  "connection:open": [payload: { socket: Socket }];

  /**
   * Fired when the proxy receives an HTTP CONNECT request to establish
   * a tunnel to an upstream destination, commonly for HTTPS or WSS traffic.
   *
   * Provides the request scope, client socket, and any initial data
   * received alongside the CONNECT request.
   */
  "connect:request": [
    payload: {
      scope: RequestScope;
      socket: Stream.Duplex;
      head: Buffer;
    },
  ];

  /**
   * Fired after the request scope and proxy context have been initialized,
   * immediately before the client and upstream streams are connected.
   *
   * Use this event to inspect or prepare the tunnel before data forwarding
   * begins.
   */
  "connect:before": [payload: { scope: RequestScope; socket: Stream.Duplex }];

  /**
   * Fired when the secure tunnel has been established and the proxy
   * is ready to forward data between the client and upstream destination.
   */
  "connect:established": [
    payload: { scope: RequestScope; socket: Stream.Duplex },
  ];

  /**
   * Fired when the proxy receives a standard, unencrypted HTTP request.
   *
   * This event does not handle intercepted HTTPS requests. Use
   * {@link "https:request"} for requests received after HTTPS interception
   * and decryption.
   */
  "http:request": [
    payload: {
      scope: RequestScope;
    },
  ];

  /**
   * Fired when an HTTPS request has been intercepted and decrypted
   * by the proxy.
   *
   * The request scope provides access to the request data and target
   * metadata available for inspection or modification.
   */
  "https:request": [
    payload: {
      scope: RequestScope;
    },
  ];

  /**
   * Fired when an error is reported through the proxy's error event.
   *
   * The error may originate from the proxy's network stack or plugin
   * execution.
   */
  error: [err: Error | unknown];
}

/**
 * Shared event emitter for proxy lifecycle and request events.
 *
 * Uses {@link ProxyEventMap} to associate event names with their
 * corresponding argument types.
 */
export const proxyEventManager = new TypedEventEmitter<ProxyEventMap>();
