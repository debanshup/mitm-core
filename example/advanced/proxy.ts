import { Proxy } from "../../src/index";
import fs from "fs";
import path from "path";
import { BypassPlugin } from "./plugins/bypass.plugin";
import { WsMockPlugin } from "./plugins/wsIntercept.plugin";
import { TEST_CA_DIR } from "../../test/constants/path";
 
const rootCa = {
  key: fs.readFileSync(path.join(TEST_CA_DIR, "/key.pem"), "utf8"),
  cert: fs.readFileSync(path.join(TEST_CA_DIR, "/CA.pem"), "utf8"),
};

const proxy = new Proxy({
  useDefaultPipelines: true,
  useCertificateCache: true,
  useResponseCache: false,
  rootCa,
});

await proxy.use(new WsMockPlugin()).use(new BypassPlugin()).listen(8001);
