import { BasePlugin, PipelineAbortSignal, RuleEngine } from "../../src/index.ts";
import { BypassRuleEngine } from "./bypass.Rule.ts";
import net from "net";

export class BypassPlugin extends BasePlugin<"tunnel:pre_establish"> {
  // Explicitly tell the proxy where to run this plugin
  readonly event = "tunnel:pre_establish";
  private bypassEngine: BypassRuleEngine;
  constructor() {
    super();
    this.bypassEngine = RuleEngine.createRule(BypassRuleEngine);
  }
  async run({ ctx }) {
    const host = ctx.clientToProxyHost;
    if (!host) return;

    if (this.bypassEngine.shouldBypass(host)) {
      const req = ctx.requestContext.req;
      const socket = req?.socket!;
      const hostHeader = req!.headers.host!;
      const [host, portStr] = hostHeader.split(":");
      const port = Number(portStr) || 443;

      const upstream = net.connect(port, host, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (ctx.head && ctx.head.length > 0) {
          upstream.write(ctx.head);
        }
        socket!.pipe(upstream);
        upstream.pipe(socket!);
      });

      upstream.on("error", (err) => {
        console.error("Direct tunnel error:", ctx.clientToProxyHost, err);
        socket?.destroy();
      });

      upstream.setNoDelay(true);
      ctx.isHandled = true;
      try {
      } finally {
        throw new PipelineAbortSignal();
      }
    }
  }
}
