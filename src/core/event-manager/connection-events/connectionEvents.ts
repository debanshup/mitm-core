import type { Socket } from "net";
import { TypedEventEmitter } from "../EventBus";
import type { IncomingMessage, ServerResponse } from "http";
import type Stream from "stream";
import type { ProxyContext } from "../../context-manager/ContextManager";
export interface ConnectionEventMap {
  TCP: [payload: { socket: Socket; ctx?: ProxyContext }];
  CONNECT: [
    payload: {
      req: IncomingMessage;
      socket: Stream.Duplex;
      head: any;
      ctx?: ProxyContext;
    },
  ];
  "CONNECT:PRE_ESTABLISH": [
    payload: { socket: Stream.Duplex; ctx?: ProxyContext },
  ];
  "CONNECT:ESTABLISHED": [
    payload: { socket: Stream.Duplex; ctx?: ProxyContext },
  ];
  "HTTP:PLAIN": [
    payload: {
      req: IncomingMessage;
      res: ServerResponse;
      ctx?: ProxyContext;
    },
  ];
  "HTTPS:DECRYPTED": [payload: { ctx: ProxyContext }];
}

export const connectionEvents = new TypedEventEmitter<ConnectionEventMap>();
