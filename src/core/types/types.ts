import type { Socket } from "net";
import type { IncomingMessage, ServerResponse } from "http";
import type Stream from "stream";
import type { TLSSocket } from "tls";
import type { STATE } from "../state/state.ts";
import type { Phase } from "../phase/Phase.ts";

export type ProxyContext = {
  req?: IncomingMessage;
  res?: ServerResponse;
  upstreamRes?: IncomingMessage;
  socket?: Stream.Duplex | Socket;
  tlsSocket?: TLSSocket;
  head?: any;
  err?: Error;
  state: Map<State | string, any>;
};
export type State = (typeof STATE)[keyof typeof STATE];
export type Handler = {
  name: string;
  phase: Phase;
  order: number;
  execute(ctx: ProxyContext): Promise<void>;
  register(): void;
  unregister(): void;
  isRegistered(): boolean;
};

export type Destroyable = {
  destroyed?: boolean;
  destroy: (error?: Error) => void;
  end?: () => void;
};