import { Proxy } from "../../src/index";
import { BypassPlugin } from "./bypass.plugin";

const proxy = new Proxy();
const bypassPlugin = new BypassPlugin();
proxy.use(bypassPlugin).listen(8001);

