import type { Socket } from "net";
import { TypedEventEmitter } from "../EventBus.ts";
import type { IncomingMessage, ServerResponse } from "http";
import type Stream from "stream";
import type { ProxyContext } from "../../../types/types.ts";
interface ConnectionEventMap {
  TCP: [payload: { socket: Socket }];
  CONNECT: [
    payload: {
      req: IncomingMessage;
      socket: Stream.Duplex;
      head: any;
    },
  ];
  "CONNECT:PRE_ESTABLISH": [
    payload: { ctx: ProxyContext; socket: Stream.Duplex },
  ];
  "CONNECT:ESTABLISHED": [
    payload: { ctx: ProxyContext; socket: Stream.Duplex },
  ];
  "HTTP:PLAIN": [payload: { req: IncomingMessage; res: ServerResponse }];
  "HTTPS:DECRYPTED": [payload: { ctx: ProxyContext }];
}

export const connectionEvents = new TypedEventEmitter<ConnectionEventMap>();
 