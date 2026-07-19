import path from "path";
import { Proxy } from "../../src/index";
import { BypassPlugin } from "./bypass.plugin";
import fs from "fs";
import { CA_PATH } from "../../src/constants/path";

const rootCa = {
  key: fs.readFileSync(path.join(CA_PATH.CA_DIR, "/key.pem"), "utf8"),
  cert: fs.readFileSync(path.join(CA_PATH.CA_DIR, "/CA.crt"), "utf8"),
};

try {
  const proxy = new Proxy({
    useDefaultPipelines: true,
    useCertificateCache: true,
    useResponseCache: false,
    rootCa,
  });

  proxy.on("tcp:connection", ({ socket }) => {});

  proxy.on("tunnel:connect", ({ payloadEvent, scope, req }) => {});
  proxy.on("tunnel:established", async ({ scope, socket }) => {});

  proxy.on("http:plain_request", ({ req, res }) => {});

  proxy.on("http:decrypted_request", ({ scope }) => {});

  
  proxy.on("error", () => {});

  const bypassPlugin = new BypassPlugin();
  proxy.use(bypassPlugin).listen(8001);
} catch (error: any) {
  console.error(error.message);
}
