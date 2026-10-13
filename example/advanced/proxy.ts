import { Proxy } from "../../src/index";
import fs from "fs";
import path from "path";
import process from "process";
import { BypassPlugin } from "./plugins/bypass.plugin";
import { WsMockPlugin } from "./plugins/wsIntercept.plugin";
const CA_PATH = {
  CA_DIR: path.join(process.cwd(), "creds/__self__"),
};

const rootCa = {
  key: fs.readFileSync(path.join(CA_PATH.CA_DIR, "/key.pem"), "utf8"),
  cert: fs.readFileSync(path.join(CA_PATH.CA_DIR, "/CA.crt"), "utf8"),
};

const proxy = new Proxy({
  useDefaultPipelines: true,
  useCertificateCache: true,
  useResponseCache: true,
  rootCa,
});

await proxy.use(new WsMockPlugin()).use(new BypassPlugin()).listen(8001);
