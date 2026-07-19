// import http2 from "http2";
// import type { RequestScope } from "../../../context-manager/types";

// export class H2OutboundBridge {
//   // Simple in-memory session cache mapping 'origin' (e.g., 'https://api.example.com') to an active H2 session
//   private static upstreamSessions = new Map<string, http2.ClientHttp2Session>();

//   /**
//    * Retrieves an existing HTTP/2 client session or establishes a new multiplexed connection.
//    */
//   private static getOrCreateUpstreamSession(origin: string): Promise<http2.ClientHttp2Session> {
//     const cachedSession = this.upstreamSessions.get(origin);

//     if (cachedSession && !cachedSession.destroyed && !cachedSession.closed) {
//       return Promise.resolve(cachedSession);
//     }

//     return new Promise((resolve, reject) => {
//       console.info(`[H2 Outbound] Creating new connection pool to: ${origin}`);
      
//       const session = http2.connect(origin, {
//         // High-perf tweaks: prevent stalling on massive downloads
//         maxSessionMemory: 100, 
//       });

//       session.on("connect", () => {
//         this.upstreamSessions.set(origin, session);
//         resolve(session);
//       });

//       session.on("error", (err) => {
//         console.error(`[H2 Outbound Pool Error] [${origin}]:`, err.message);
//         this.upstreamSessions.delete(origin);
//         reject(err);
//       });

//       session.on("close", () => {
//         console.info(`[H2 Outbound Pool Closed] [${origin}]`);
//         this.upstreamSessions.delete(origin);
//       });

//       // Prevent Node process hanging if this pool is empty/idle
//       session.unref();
//     });
//   }

//   /**
//    * Dispatches the decrypted downstream stream to the target upstream destination
//    */
//   public static async execute(scope: RequestScope): Promise<void> {
//     const { sessionContext, requestContext } = scope;
//     const downstreamStream = requestContext.h2Stream;

//     if (!downstreamStream || downstreamStream.destroyed) {
//       console.warn("[H2 Outbound] Downstream stream already dead. Aborting outbound dispatch.");
//       return;
//     }

//     // Fallback protection: Ensure target URL has been calculated by your router
//     let targetUrl: URL;
//     try {
//       const urlString = proxyContext.proxyToUpstreamUrl || proxyContext.clientToProxyUrl;
//       if (!urlString) throw new Error("No upstream URL found in context scope.");
//       targetUrl = new URL(urlString);
//     } catch (err: any) {
//       console.error("[H2 Outbound] Invalid Target URL:", err.message);
//       this.sendDownstreamError(downstreamStream, 400, "Bad Request: Invalid Target Upstream URL");
//       return;
//     }

//     try {
//       // 1. Fetch or initialize multiplexed tunnel to destination origin
//       const origin = targetUrl.origin;
//       const upstreamSession = await this.getOrCreateUpstreamSession(origin);

//       // 2. Format outgoing H2 pseudo-headers & mix in sanitized headers
//       const outboundHeaders = {
//         ...(proxyContext.sanitizedHeaders ?? {}),
//         ":method": "GET",
//         ":path": targetUrl.pathname + targetUrl.search,
//         ":scheme": targetUrl.protocol.replace(":", ""),
//         ":authority": targetUrl.host,
//       };

//       // 3. Initiate the proxy upstream stream
//       const upstreamStream = upstreamSession.request(outboundHeaders);

//       // --- Pipeline Wiring & Backpressure management ---

//       // Forward headers/response back down to the client when upstream replies
//       upstreamStream.on("response", (responseHeaders) => {
//         if (!downstreamStream.destroyed) {
//           downstreamStream.respond(responseHeaders);
//         }
//       });

//       // Bidirectional Pipe: Downstream request body -> Upstream request destination
//       downstreamStream.pipe(upstreamStream);

//       // Bidirectional Pipe: Upstream response body -> Downstream client response
//       upstreamStream.pipe(downstreamStream);

//       // --- Robust Error / Tear Down Synchronization ---

//       upstreamStream.on("error", (err) => {
//         console.error(`[H2 Outbound Upstream Stream Error] [${targetUrl.host}]:`, err.message);
//         this.sendDownstreamError(downstreamStream, 502, "Bad Gateway");
//       });

//       // Handle cases where the client aborts mid-flight
//       downstreamStream.on("close", () => {
//         if (!upstreamStream.destroyed) {
//           upstreamStream.close(http2.constants.NGHTTP2_CANCEL);
//         }
//       });

//     } catch (err: any) {
//       console.error("[H2 Outbound Execution Critical Error]:", err.message);
//       this.sendDownstreamError(downstreamStream, 502, "Bad Gateway Connection Failure");
//     }
//   }

//   /**
//    * Safe helper to respond with error frames down to the client stream
//    */
//   private static sendDownstreamError(stream: http2.ServerHttp2Stream, status: number, msg: string) {
//     try {
//       if (!stream.destroyed) {
//         stream.respond({ ":status": status });
//         stream.end(msg);
//       }
//     } catch {}
//   }
// }