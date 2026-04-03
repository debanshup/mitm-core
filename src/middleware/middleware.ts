import { IncomingMessage, ServerResponse } from "http";
connectionEvents;
import Stream from "stream";
import { ContextManager } from "../core/context-manager/ContextManager.ts";
import Pipeline from "../core/pipelines/PipelineCompiler.ts";
import { Phase } from "../core/phase/Phase.ts";
import { STATE } from "../core/state/state.ts";
import { ProxyUtils } from "../core/utiils/ProxyUtils.ts";
import type { ProxyContext } from "../core/types/types.ts";
import { connectionEvents } from "../core/event-manager/connection-events/connectionEvents.ts";

/**
 * @context_type
 */

connectionEvents.on("TCP", ({ socket }) => {
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
    ProxyUtils.cleanUp([socket]);
    ctx.reqCtx!.state.set(STATE.is_finished, true);
  });
});

connectionEvents.on("HTTP:PLAIN", async ({ req, res }) => {
  const ctx = ContextManager.getContext(req.socket);
  ctx.conn_type = "http";
  ctx.reqCtx!.req = req;
  ctx.reqCtx!.res = res;
  ctx.reqCtx.next_phase = Phase.REQUEST;
  // run pipeline
  await Pipeline.run(ctx);
});

connectionEvents.on("CONNECT", async ({ req, socket, head }) => {
  const ctx = ContextManager.getContext(socket);
  ctx.conn_type = "https";
  ctx.head = head;
  ctx.reqCtx!.req = req;
  ctx.reqCtx.next_phase = Phase.HANDSHAKE;
  // run pipeline
  await Pipeline.run(ctx);
});

connectionEvents.on("HTTP:DECRYPTED", async ({ ctx }) => {
  // console.info("dec https fired!")

  ctx.reqCtx.next_phase = Phase.REQUEST;

  try {
    await Pipeline.run(ctx);
  } catch (err) {
    console.error(
      `[Decrypted Pipeline Error] ${ctx.reqCtx.req!.headers.host}`,
      err,
    );
    if (!ctx.reqCtx.res!.headersSent) {
      ctx.reqCtx.res!.statusCode = 502;
      ctx.reqCtx.res!.end("Proxy Error");
    }
  }
});
