import { Proxy } from "../../src/index.ts";
import { BypassPlugin } from "./bypass.plugin.ts";

const proxy = new Proxy();
const bypassPlugin = new BypassPlugin();
proxy.use(bypassPlugin).listen(8001);

