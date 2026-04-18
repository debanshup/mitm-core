import { Proxy } from "../../src/index";
const proxy = new Proxy();
proxy.on("tcp:connection", ({ socket }) => {
});

proxy.on("tunnel:connect", ({ req, head, socket, payloadEvent }) => {
});
proxy.on("tunnel:pre_establish", async ({ ctx, socket }) => {
});
proxy.on("tunnel:established", async ({ ctx, socket }) => {
});

proxy.on("http:plain_request", ({ req, res }) => {
});

proxy.on("http:decrypted_request", ({ ctx }) => {
});

proxy.on("decrypted_response", ({ ctx }) => {
});

proxy.on("error", (err) => {});

proxy.listen(8001);
