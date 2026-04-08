import {
  Middleware,
  Proxy,
  RuleEngine,
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

// RuleEngine.register("demo", "rules/demo.rules.txt", new RegexRuleParser(), []);
RuleEngine.register(
  "tls-bypass",
  "rules/bypass.rules.txt",
  new RegexRuleParser(),
  [],
);
// RuleEngine.saveHostToBypass("www.xxxx.com")
const proxy = new Proxy();
proxy.onTCPconnection(async (socket, next) => {
  next();
});
proxy.onConnect(async (req, socket, head, {requestDataEvent, tlsEvent}, next) => {
  // events.tlsEvent.once("TLS:LEAF", ({ ctx }) => {
  //   ctx?.customCertificates?.set(ctx.clientToProxyHost!, {
  //     cert: "this is cert",
  //     key: "this is key",
  //   });
  // });
  next();
});

proxy.onHttpRequest(async (req, res, next) => {
  next();
});

proxy.onDecryptedRequest(({ ctx }) => {
  // console.info("proxy to upstream url", ctx.proxyToUpstreamUrl);
});

// proxy.onLeafCertificateCreation(({ ctx }) => {
//   ctx?.customCertificates?.set(ctx.clientToProxyHost!, {
//     cert: "this is cert",
//     key: "this is key",
//   });
//   // console.info("injected custom leaf for:", host);
// });

proxy.listen(8001);
