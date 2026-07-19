import type { Socket } from "net";
import type Stream from "stream";
import type { IncomingMessage, ServerResponse } from "http";

import { TypedEventEmitter } from "../EventBus";

import type { RequestScope } from "../../context-manager/types";

export interface ConnectionEventMap {
  /**
   * Raw TCP connection accepted.
   */
  TCP: [
    payload: {
      socket: Socket;
      scope: RequestScope;
    },
  ];

  /**
   * HTTPS CONNECT request received.
   */
  CONNECT: [
    payload: {
      req: IncomingMessage;
      socket: Stream.Duplex;
      head: Buffer;
      scope: RequestScope;
    },
  ];

  /**
   * Before tunnel establishment.
   */
  "CONNECT:PRE_ESTABLISH": [
    payload: {
      socket: Stream.Duplex;
      scope: RequestScope;
    },
  ];

  /**
   * Tunnel established.
   */
  "CONNECT:ESTABLISHED": [
    payload: {
      socket: Stream.Duplex;
      scope: RequestScope;
    },
  ];

  /**
   * HTTP/1.1 request.
   */
  "HTTP:PLAIN": [
    payload: {
      req: IncomingMessage;
      res: ServerResponse;
      scope: RequestScope;
    },
  ];

  /**
   * Decrypted HTTPS request (H1 or H2).
   */
  "HTTPS:DECRYPTED": [
    payload: {
      scope: RequestScope;
    },
  ];
}

export const connectionEvents = new TypedEventEmitter<ConnectionEventMap>();
