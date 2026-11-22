import {
  BasePlugin,
  type RequestScope,
  PipelineAbortSignal,
  Proxy,
} from "../../src";

class HostPolicyPlugin extends BasePlugin<"proxy:client-http-request"> {
  readonly event = "proxy:client-http-request";

  private readonly blockedHosts = new Set(["example.com", "restricted.test"]);

  async run({ scope }: { scope: RequestScope }): Promise<void> {
    const host = scope.request.target.originalHost;

    if (!host || !this.blockedHosts.has(host)) {
      return;
    }

    const res = scope.request.client.res;

    if (!res || res.headersSent || res.writableEnded) {
      throw new PipelineAbortSignal({
        message: `Request blocked: ${host}`,
        reason: "policy",
        plugin: this,
        event: this.event,
      });
    }

    res.writeHead(403, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        error: "Forbidden",
        message: `Access to ${host} is not allowed`,
      }),
    );

    throw new PipelineAbortSignal({
      message: `Blocked request to ${host}`,
      reason: "policy",
      plugin: this,
      event: this.event,
    });
  }
}

const proxy = new Proxy();

proxy.use(new HostPolicyPlugin());

void proxy.listen(8080);
