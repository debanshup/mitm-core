import type { ClientRequest, IncomingMessage, ServerResponse } from "http";
import type { STATE } from "../state/state.ts";
import type { Phase } from "../phase/Phase.ts";
import type Stream from "stream";

export type ProxyContext = {
  id: string;
  head?: any;
  err?: Error;
  conn_state: Map<string, any>;
  conn_type?: "tcp" | "http" | "https";
  reqCtx: {
    id: string;
    req?: IncomingMessage | undefined;
    res?: ServerResponse | undefined;
    upstream?: ClientRequest | undefined;
    upstreamRes?: IncomingMessage | undefined;
    state: Map<State | string, any>;
    next_phase?: Phase | undefined;
  };
};
export type State = (typeof STATE)[keyof typeof STATE];
export type Handler = {
  phase: Phase;
  handle(ctx: ProxyContext): Promise<void>;
};

export type Destroyable<T extends Stream> = T & {
  destroyed?: boolean;
  destroy: (error?: Error) => void;
  end?: () => void;
};

export type CachedResponse = {
  status: number;
  etag?: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  expires: number;
};
