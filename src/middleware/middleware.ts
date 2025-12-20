import { IncomingMessage, ServerResponse } from "http";
import {
  ConnectionTypes,
  connectionEvents,
} from "../observer/connection_type/emitter.ts";
import Stream from "stream";
import { createHTTPUpstream } from "./handlers/upstream/httpUpstream.ts";
import { parseConnectData } from "../utils/parseReqData.ts";
import { createHTTPSUpstream } from "./handlers/upstream/httpsUpstream.ts";

connectionEvents.on(
  ConnectionTypes.HTTP,
  ({ req, res }: { req: IncomingMessage; res: ServerResponse }) => {
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
  ({ req, socket }: { req: IncomingMessage; socket: Stream.Duplex }) => {
    const { host, port } = parseConnectData(req);
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    const upstream = createHTTPSUpstream(host!, port);
    /**
     * @manual_insertion for mitm mode
     */
    // upstream.on("data", (d) => {
    //   if (!socket.destroyed) {
    //     socket.write(d);
    //   }
    // });
    socket.pipe(upstream);
    upstream.pipe(socket);
  }
);
