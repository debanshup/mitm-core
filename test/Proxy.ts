import Proxy from "../src/dist/Proxy.ts";
await Proxy.registerMiddleware({ initializePipelines: true });
const proxy = new Proxy();
// setInterval(() => {
//   const mem = process.memoryUsage();
//   console.log("Heap Used:", mem.heapUsed / 1024 / 1024, "MB");
// }, 1000);

proxy.onTCPconnection((socket, defaultHandler) => {
  defaultHandler();
});
proxy.onConnect((req, socket, head, defaultHandler) => {
  defaultHandler();
});

proxy.onRequest((req, res, defaultHandler) => {
  // if you want to create your custom logic, don't call default handler
  defaultHandler();
});

proxy.onDecryptedRequest(({ ctx }) => {
  // handle
  // ctx.reqCtx.req?.destroy()
  // console.info(ctx.reqCtx.req?.destroyed)
});

proxy.onResponseData(({ ctx }) => {
  const host = ctx.reqCtx.req?.headers.host || "";
console.info(host)
  if (host.includes("example.com")) {
    // 1. Define your new payload
    const newBody = "<h1>YOU are under attack!</h1>";

    const upstreamRes = ctx.reqCtx.upstreamRes!;
    const clientRes = ctx.reqCtx.res!;

    // 2. CRITICAL HEADER CLEANUP
    // The original server might have sent the page as 'gzip' or 'br'.
    // If you don't delete this header, the browser will try to decompress
    // your plain text string and show a blank page or gibberish!
    delete upstreamRes.headers["content-encoding"];
    delete upstreamRes.headers["content-length"];

    // 3. Inject your new headers
    upstreamRes.headers["content-type"] = "text/html; charset=utf-8";
    upstreamRes.headers["content-length"] =
      Buffer.byteLength(newBody).toString();

    // 4. Send the new response to the client
    // (Because you call .end(), your pipeline knows to skip the default .pipe() behavior!)
    clientRes.writeHead(200, upstreamRes.headers);
    clientRes.end(newBody);

    // 5. CRITICAL MEMORY CLEANUP
    // Because we skipped the default .pipe(), the original data from the server
    // is still flowing into our proxy's memory with nowhere to go.
    // We MUST destroy the stream to free the socket.
    upstreamRes.destroy();
  }
});
proxy.onError((err) => {
  console.error("proxy error", err.message);
  proxy.close();
});

proxy.listen(8001, () => {
  console.info("Proxy started at PORT:", 8001);
});
