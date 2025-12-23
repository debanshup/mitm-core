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
import { PipelineCompiler } from "../core/pipelines/PipelineCompiler.ts";
import { PluginRegistry } from "../plugins/PluginRegistry.ts";

/**
 * @context_type
 */
export type ProxyContext = {
  req?: IncomingMessage;
  res?: ServerResponse;
  socket?: Stream.Duplex | Socket;
  head?: any;
  state: Map<string, any>;
};

// const ctx: ProxyContext = {
//   state: new Map(),
// };

connectionEvents.on(ConnectionTypes.TCP, ({ socket }) => {
  ContextManager.getContext(socket);
});

connectionEvents.on(
  ConnectionTypes.HTTP,
  ({ req, res }: { req: IncomingMessage; res: ServerResponse }) => {
    // get and mutate ctx
    const ctx = ContextManager.getContext(req.socket);
    ctx.req = req;
    ctx.res = res;

    // run pipeline here

    // const {connect, request, response} = PipelineCompiler.compile(PluginRegistry.getEnabledPlugins())
    // console.info(connect, request, response)

    console.log("REQ:", req.method, req.url);
    const upstream = createHTTPUpstream(req, res);
    upstream.on("response", (r) => {
      console.log("status:", r.statusCode);
      res.writeHead(r.statusCode!, r.headers);
      r.pipe(res);
      r.on("data", (chunk: Buffer) => {
        console.log("Received chunk:", chunk.length);
      });
    });
    req.pipe(upstream);
  }
);

connectionEvents.on(
  ConnectionTypes.CONNECT,
  ({
    req,
    socket,
    head,
  }: {
    req: IncomingMessage;
    socket: Stream.Duplex;
    head: any;
  }) => {
    // get and mutate ctx
    const ctx = ContextManager.getContext(socket);
    ctx.req = req;
    ctx.head = head;

    // run pipeline here

    const { host, port } = parseConnectData(req);

    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    /**
     * @default
     */
    const upstream = createHTTPSUpstream(host!, port);
    socket.pipe(upstream);
    upstream.pipe(socket);
  }
);
