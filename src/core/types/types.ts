import type { ClientRequest, IncomingMessage, ServerResponse } from "http";
import type { STATE } from "../state/state.ts";
import type { Phase } from "../phase/Phase.ts";

export type ProxyContext = {
  id: string;
  // socket?: Stream.Duplex | Socket;
  // tlsSocket?: TLSSocket;
  head?: any;
  err?: Error;
  conn_state: Map<string, any>;
  conn_type?: "tcp" | "http" | "https";
  reqCtx: {
    id: string;
    req?: IncomingMessage;
    res?: ServerResponse;
    upstream?: ClientRequest,
    state: Map<State | string, any>;
    next_phase?: Phase;
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

export type CachedResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  expires: number;
};
