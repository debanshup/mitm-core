import { IncomingMessage, ServerResponse } from "http";
import {
  ConnectionTypes,
  connectionEvents,
} from "../core/event-manager/EventBus.ts";
import Stream from "stream";
import { ContextManager } from "../core/context-manager/ContextManager.ts";
import Pipeline from "../core/pipelines/PipelineCompiler.ts";
import { Phase } from "../core/phase/Phase.ts";
import { STATE } from "../core/state/state.ts";
import { ProxyUtils } from "../core/utiils/ProxyUtils.ts";

/**
 * @context_type
 */

connectionEvents.on(ConnectionTypes.TCP, ({ socket }) => {
  // disable nagle's at tcp level
  socket.setNoDelay(true);
  const ctx = ContextManager.getContext(socket);
  ctx.conn_state.set("conn", "tcp");
  socket.on("error", async (err: Error) => {
    ProxyUtils.cleanUp([socket]);
    ctx.err = err;
    ctx.reqCtx!.state.set(STATE.is_error, true);
    console.error("[TCP_CLIENT_ERROR]", err);
  });
  socket.on("close", () => {
    // console.error("[Socket destroyed at middleware]", socket.destroyed);
    ProxyUtils.cleanUp([socket]);
    ctx.reqCtx!.state.set(STATE.is_finished, true);
  });
  // console.info("socket created", ctx.id);
});

connectionEvents.on(
  ConnectionTypes.HTTP,
  async ({ req, res }: { req: IncomingMessage; res: ServerResponse }) => {
    // console.info("HTTP_CONNECTION:", req.url);

    //mutate ctx
    const ctx = ContextManager.getContext(req.socket);
    ctx.conn_type = "http";
    ctx.reqCtx!.req = req;
    ctx.reqCtx!.res = res;
    ctx.reqCtx.next_phase = Phase.REQUEST;
    // run pipeline
    await Pipeline.run(ctx);
  },
);

connectionEvents.on(
  ConnectionTypes.CONNECT,
  async ({
    req,
    socket,
    head,
  }: {
    req: IncomingMessage;
    socket: Stream.Duplex;
    head: any;
  }) => {
    // console.info(req.headers.host)
    // mutate ctx
    const ctx = ContextManager.getContext(socket);
    ctx.conn_type = "https";
    ctx.head = head;
    ctx.reqCtx!.req = req;
    ctx.reqCtx.next_phase = Phase.HANDSHAKE;
    await Pipeline.run(ctx);
  },
);
