import type { Socket } from "net";
import type { IncomingMessage, ServerResponse } from "http";
import type Stream from "stream";
import type { TLSSocket } from "tls";
import type { STATE } from "../state/state.ts";
import type { Phase } from "../phase/Phase.ts";

export type ProxyContext = {
  id: string;
  socket?: Stream.Duplex | Socket;
  tlsSocket?: TLSSocket;
  head?: any;
  err?: Error;
  conn_state: Map<string, any>;
  conn_type?: "tcp" | "http" | "https";
  reqCtx: {
    id: string;
    // conn_id: string;
    req?: IncomingMessage;
    res?: ServerResponse;
    upstreamRes?: IncomingMessage | any | undefined;
    state: Map<State | string, any>;
    /**
     * @experimental
     * current_phase?: Phase;
     */
    // current_phase?: Phase;
    next_phase?: Phase;
    // next_handler?: Handler;
  };
};
export type State = (typeof STATE)[keyof typeof STATE];
export type Handler = {
  // name: string;
  phase: Phase;
  handle(ctx: ProxyContext): Promise<void>;
  // register(): void;
  // unregister(): void;
  // isRegistered(): boolean;
};

export type Destroyable = {
  destroyed?: boolean;
  destroy: (error?: Error) => void;
  end?: () => void;
};
