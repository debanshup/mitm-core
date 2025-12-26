import { IncomingMessage, ServerResponse } from "http";
import {
  ConnectionTypes,
  connectionEvents,
} from "../core/event-manager/EventBus.ts";
import Stream from "stream";
import { createHTTPUpstream } from "../utils/upstream/httpUpstream.ts";
import { parseConnectData } from "../utils/parser/parseReqData.ts";
import { createHTTPSUpstream } from "../utils/upstream/httpsUpstream.ts";
import type { Socket } from "net";
import { ContextManager } from "../core/context-manager/ContextManager.ts";
import { Pipeline } from "../core/pipelines/PipelineCompiler.ts";
import { PluginRegistry } from "../plugins/PluginRegistry.ts";
import { Phase } from "../core/phase/Phase.ts";
import type { TLSSocket } from "tls";

/**
 * @context_type
 */
export const STATE = {
  STOP: Symbol("STOP"),
  CONNECT_HANDLED: Symbol("CONNECT_HANDLED"),
  SOCKET: Symbol("SOCKET"),
  TLS_SOCKET: Symbol("TLS_SOCKET"),
};

export type State = (typeof STATE)[keyof typeof STATE];

export type ProxyContext = {
  req?: IncomingMessage;
  res?: ServerResponse;
  upstreamRes: IncomingMessage,
  socket?: Stream.Duplex | Socket;
  tlsSocket: TLSSocket;
  head?: any;
  err?: Error;
  state: Map<State | string, any>;
};

connectionEvents.on(ConnectionTypes.TCP, ({ socket }) => {
  // disable nagle's at tcp level
  socket.setNoDelay(true);
  const ctx = ContextManager.getContext(socket);
  ctx.state.set(STATE.SOCKET, socket);
  socket.on("error", async (err: Error) => {
    if (!socket.destroyed) {
      socket.destroy();
    }
    ctx.err = err;
    ctx.state.set(STATE.STOP, true);
    console.error("[TCP_CLIENT_ERROR]", err);
  });
  socket.on("close", () => {
    if (!socket.destroyed) {
      socket.destroy();
    }
    ctx.state.set(STATE.STOP, true);
  });
});

connectionEvents.on(
  ConnectionTypes.HTTP,
  async ({ req, res }: { req: IncomingMessage; res: ServerResponse }) => {
    // console.info(req.headers)
    //mutate ctx
    const ctx = ContextManager.getContext(req.socket);
    ctx.req = req;
    ctx.res = res;
    // run pipeline here
    await Pipeline.run(Phase.REQUEST, ctx);
    await Pipeline.run(Phase.RESPONSE, ctx);

    // const upstream = createHTTPUpstream(req, res);
    // upstream.on("error", async (err) => {
    //   if (!upstream.destroyed) {
    //     upstream.destroy();
    //   }

    //   /**
    //    * set status code based on error type
    //    */
    //   res.statusCode = 502;
    //   ctx.res = res;
    //   ctx.err = err;
    //   await Pipeline.run(Phase.RESPONSE, ctx);
    //   res.end();
    // });
    // upstream.on("close", () => {
    //   if (!upstream.destroyed) {
    //     upstream.destroy();
    //   }
    // });

    // upstream.on("response", async (r) => {
    //   // console.log("status:", r.statusCode);
    //   res.writeHead(r.statusCode!, r.headers);
    //   await Pipeline.run(Phase.RESPONSE, ctx);
    //   r.pipe(res);

    //   // r.on("data", (chunk: Buffer) => {
    //   //   // console.log("Received chunk:", chunk.length);
    //   // });
    // });
    // req.pipe(upstream);
  }
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
    // mutate ctx
    const ctx = ContextManager.getContext(socket);
    ctx.req = req;
    ctx.head = head;

    /**
     * @important ->
     *     if (site is protected) {
        bypass MITM → direct tunnel}
        else {
        MITM normally
      }
     */

    await Pipeline.run(Phase.CONNECT, ctx);

    // run pipeline here

    // const { host, port } = parseConnectData(req);

    // socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    // /**
    //  * @default
    //  */
    // const upstream = createHTTPSUpstream(host!, port);
    // upstream.on("error", async (err) => {
    //   if (!upstream.destroyed) {
    //     upstream.destroy();
    //   }
    //   ctx.err = err;
    //   await Pipeline.run(Phase.RESPONSE, ctx);
    // });
    // upstream.on("close", () => {
    //   if (!upstream.destroyed) {
    //     upstream.destroy();
    //   }
    // });

    // socket.pipe(upstream);
    // upstream.pipe(socket);
  }
);
