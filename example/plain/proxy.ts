import { Proxy } from "../../src/index";
import fs from "fs";
import { CA_PATH } from "../../constants/path";
import path from "path";

const rootCa = {
  key: fs.readFileSync(path.join(CA_PATH.CA_DIR, "/key.pem"), "utf8"),
  cert: fs.readFileSync(path.join(CA_PATH.CA_DIR, "/CA.crt"), "utf8"),
};

const proxy = new Proxy({ rootCa });

proxy.on("tcp:connection", () => {});

proxy.on("tunnel:connect", ({ payloadEvent }) => {
  payloadEvent.on("PAYLOAD:REQUEST", ({ scope }) => {
    console.info("req",scope)
  });
  payloadEvent.on("PAYLOAD:RESPONSE", ({ scope }) => {
    console.info("res",scope)
  });
});
proxy.on("tunnel:pre_establish", async ({ scope, socket }) => {});
proxy.on("tunnel:established", async ({ scope, socket }) => {});

proxy.on("http:plain_request", ({ req, res }) => {});

proxy.on("http:decrypted_request", ({ scope }) => {});

proxy.on("decrypted_response", ({ scope }) => {});

proxy.on("error", () => {});

proxy.listen(8001);
