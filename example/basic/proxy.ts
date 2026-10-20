import { Proxy } from "../../src/index";
import fs from "fs";
import { TEST_CA_DIR } from "../../test/constants/path";
import path from "path";

const rootCa = {
  key: fs.readFileSync(path.join(TEST_CA_DIR, "/key.pem"), "utf8"),
  cert: fs.readFileSync(path.join(TEST_CA_DIR, "/CA.pem"), "utf8"),
};

const proxy = new Proxy({ rootCa });

proxy.on("connection:open", () => {});

proxy.on("connect:request", ({}) => {});

proxy.on("http:request", ({ scope }) => {});

proxy.on("https:request", ({ scope }) => {});

proxy.listen(8001);
