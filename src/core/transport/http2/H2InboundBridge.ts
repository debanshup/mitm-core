// import http2 from "http2";
// import type tls from "tls";
// import util from "node:util";

// import type { RequestScope } from "../../../context-manager/types";
// import { connectionEvents } from "../../../event-manager/connection-events/connectionEvents";
// import { H1InboundBridge } from "../http1/H1InboundBridge";
// import fs from "fs";

// const H2_STRIPPED_HEADERS = new Set([
//   "connection",
//   "keep-alive",
//   "transfer-encoding",
//   "upgrade",
//   "proxy-connection",
// ]);

// export class H2InboundBridge {
//   private static h2Server = http2.createSecureServer();

//   static init() {
//     this.h2Server.on("session", (session: http2.ServerHttp2Session) => {
//       const scope = (session.socket as any).__scope as RequestScope;
//       console.info("[H2] Session Established");

//       connectionEvents.emit("HTTPS:DECRYPTED", { scope });

//       // If the browser rejects the connection, it will send a GOAWAY frame.
//       session.on("goaway", (errorCode, lastStreamID, opaqueData) => {
//         console.warn(
//           `[H2 GOAWAY] Code: ${errorCode}, Data: ${opaqueData.toString()}`,
//         );
//       });

//       // Listen for abrupt closures
//       session.on("close", () => {
//         console.info("[H2] Session Closed");
//       });

//       session.on("error", (err) => {
//         console.error("[H2 Session Error]", err);
//       });

//       session.on("stream", async (clientStream, clientHeaders) => {
//         console.info("[H2] Stream Received!", clientHeaders[":path"]);

//         // Accumulate request chunks if you need to inspect/modify the body
//         let requestBodyChunks: Buffer[] = [];

//         clientStream.on("data", (chunk: Buffer) => {
//           requestBodyChunks.push(chunk);
//         });

//         clientStream.on("end", async () => {
//           // const fullRequestBody = Buffer.concat(requestBodyChunks);
//           // You now have the full headers (clientHeaders) and full body (fullRequestBody)

//           // Process MITM forwarding...
//           console.info("forwarding to decrypted")
//           connectionEvents.emit("HTTPS:DECRYPTED", {scope})
//         });

//         clientStream.on("error", (err) => {
//           console.error("[H2 Client Stream Error]", err);
//         });
//       });
//     });
//   }

//   public static async execute(
//     scope: RequestScope,
//     tlsSocket: tls.TLSSocket,
//   ): Promise<void> {
//     (tlsSocket as any).__scope = scope;

//     // Bypass TS strict typing to inject the server reference
//     (tlsSocket as any).server = this.h2Server;

//     this.h2Server.emit("secureConnection", tlsSocket);
//   }
// }

// H2InboundBridge.init();
