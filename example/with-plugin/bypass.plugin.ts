 ;
import {
  BasePlugin,
  PipelineAbortSignal,
  RuleEngine,
  type RequestScope,
} from "../../src/index";
import { BypassRuleEngine } from "./bypass.Rule";
import net from "net";

export class BypassPlugin extends BasePlugin<"tunnel:pre_establish"> {
  // Explicitly tell the proxy where to run this plugin
  readonly event = "tunnel:pre_establish";
  private bypassEngine: BypassRuleEngine;
  constructor() {
    super();
    this.bypassEngine = RuleEngine.createRule(BypassRuleEngine);
  }
  async run({ scope }: { scope: RequestScope }) {
    const { sessionContext, requestContext, lifecycle } = scope;

    // console.info("sessionContext socket:",sessionContext.socket);

    const host = requestContext.clientToProxyHost;
    if (!host) return;

    if (this.bypassEngine.shouldBypass(host)) {
      const req = requestContext.req;
      const hostHeader = req!.headers.host!;
      const [host, portStr] = hostHeader.split(":");
      const port = Number(portStr) || 443;
      const socket = sessionContext.socket;
      const upstream = net.connect(port, host, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (sessionContext.head && sessionContext.head.length > 0) {
          upstream.write(sessionContext.head);
        }
        socket!.pipe(upstream);
        upstream.pipe(socket!);
      });

      upstream.on("error", (err) => {
        console.error("Direct tunnel error:", requestContext.clientToProxyHost, err);
        socket?.destroy();
      });

      upstream.setNoDelay(true);
      lifecycle.isHijacked = true;
      try {
        // do something
      } finally {
        throw new PipelineAbortSignal({
          event: this.event,
          plugin: this,
          message: "Pipeline halted intentionally",
        });
      }
    }
  }
}
