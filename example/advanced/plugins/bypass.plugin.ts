import net from "net";
import {
  BasePlugin,
  PipelineAbortSignal,
  RuleEngine,
  type RequestScope,
} from "../../../src";
import { BypassRuleEngine } from "../rules/bypass.Rule";

export class BypassPlugin extends BasePlugin<"proxy:client-before-handshake"> {
  readonly event = "proxy:client-before-handshake";
  private bypassEngine: BypassRuleEngine;

  constructor() {
    super();
    this.bypassEngine = RuleEngine.createRule(BypassRuleEngine);
  }

  async run({ scope }: { scope: RequestScope }) {
    const { session, request, lifecycle } = scope;
    const originalHost = request.target.originalHost;

    if (!originalHost) return;

    if (this.bypassEngine.shouldBypass(originalHost)) {
      try {
        const port = 443;
        const socket = session.socket;

        const upstream = net.connect(port, originalHost, () => {
          if (socket.writable && !socket.destroyed) {
            socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            if (session.head && session.head.length > 0) {
              upstream.write(session.head);
            }
            // Bi-directional pipe
            socket.pipe(upstream);
            upstream.pipe(socket);
          }
        });

        upstream.on("error", (err) => {
          // console.debug(`[Bypass] Upstream error for ${originalHost}:`, err.message);
          if (!socket.destroyed) socket.destroy();
        });

        socket.on("error", (err) => {
          // console.debug(`[Bypass] Client error for ${originalHost}:`, err.message);
          if (!upstream.destroyed) upstream.destroy();
        });

        socket.once("close", () => {
          if (!upstream.destroyed) upstream.destroy();
        });

        upstream.setNoDelay(true);
        lifecycle.isHijacked = true;
      } finally {
        // Halt the pipeline so HandshakeHandler doesn't try to attach TLS
        throw new PipelineAbortSignal({
          event: this.event,
          plugin: this,
          message: `Bypassed TLS for ${originalHost}`,
        });
      }
    }
  }
}
