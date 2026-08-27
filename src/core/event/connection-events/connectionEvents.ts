import type { Socket } from "net";
import type Stream from "stream";
import type { ClientRequest, IncomingMessage, ServerResponse } from "http";

import { TypedEventEmitter } from "../EventBus";

import type { RequestScope } from "../../scope/types";

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

  "UPSTREAM:INIT": [
    payload: {
      scope: RequestScope;
      upstreamReq: ClientRequest;
    },
  ];

  "UPSTREAM:RESPONSE": [
    payload: {
      scope: RequestScope;
      upstreamRes: IncomingMessage;
    },
  ];

  "WS:UPGRADE": [
    payload: {
      req: IncomingMessage;
      socket: Stream.Duplex;
      head: Buffer;
      scope: RequestScope;
    },
  ];
}

export const connectionEvents = new TypedEventEmitter<ConnectionEventMap>();
