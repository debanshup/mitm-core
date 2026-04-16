import { Proxy } from "../../src/index.ts";
const proxy = new Proxy();
proxy.on("tcp:connection", ({ socket }) => {
  // console.info(typeof socket)
});

proxy.on(
  "tunnel:connect",
  ({ req, head, socket, event}) => {
    // console.info("connect:", req.headers.host)
  },
);
proxy.on("tunnel:pre_establish", async ({ ctx, socket }) => {
  // console.info("pre");
});
proxy.on("tunnel:established", async ({ ctx, socket }) => {
  // console.info("post")
});

proxy.on("http:plain_request", ({ req, res }) => {
  // console.info("http:plain_request", req.headers.host);
});

proxy.on("http:decrypted_request", ({ ctx }) => {
  // console.info("http:decrypted_request", ctx.clientToProxyHost);
});

proxy.on("decrypted_response", ({ ctx }) => {
  // console.info("decrypted_response", ctx.clientToProxyHost);
});

proxy.listen(8001);
