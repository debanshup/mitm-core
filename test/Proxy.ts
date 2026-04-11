import {
  Middleware,
  PipelineAbortSignal,
  Proxy,
  RuleEngine,
  Tunnel,
  type IRuleParser,
} from "../src/index.ts";
Middleware.register({ initializePipelines: true });
export class RegexRuleParser implements IRuleParser<RegExp[]> {
  parse(raw: string): RegExp[] {
    return Array.from(
      new Set(
        raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#")),
      ),
    ).flatMap((l) => {
      try {
        return [new RegExp(l, "i")];
      } catch (error) {
        console.error(`Invalid regex skipped: "${l}"`);
        return [];
      }
    });
  }

  match(rules: RegExp[], target: string): boolean {
    return rules.some((r) => r.test(target));
  }

  formatForSave(host: string): string {
    const escapedHost = host.replace(/\./g, "\\.");
    return `^(?:[a-z0-9-]+\\.)*${escapedHost}$`;
  }
}

RuleEngine.register(
  "tls-bypass",
  "rules/bypass.rules.txt",
  new RegexRuleParser(),
  [],
);
// RuleEngine.saveHostToBypass("www.xxxx.com")
const proxy = new Proxy();

proxy.on("tcp:connection", ({ socket }) => {
  // console.info(typeof socket)
});

proxy.on(
  "tunnel:connect",
  ({ req, head, socket, events: { requestDataEvent, tlsEvent } }) => {
    // console.info("connect:", req.headers.host)
  },
);

proxy.on("http:plain_request", ({ req, res }) => {
  // console.info("http:plain_request", req.headers.host);
});

proxy.on("http:decrypted_request", ({ ctx }) => {
  // console.info("http:decrypted_request", ctx.clientToProxyHost);
});

proxy.on("decrypted_response", ({ ctx }) => {
  // console.info("decrypted_response", ctx.clientToProxyHost);
});

proxy.on("tunnel:pre_establish", async ({ ctx, socket }) => {
  // console.info("pre");
  const host = ctx.clientToProxyHost!;
  if (RuleEngine.shouldBypass(host)) {
    await Tunnel.createDirectTunnel(ctx);
    throw new PipelineAbortSignal();
  }
});
proxy.on("tunnel:established", async ({ ctx, socket }) => {
  // console.info("post")
});

proxy.listen(8001);
