import { BasePlugin, type RequestScope, Proxy } from "../../src";

class LocalHealthPlugin extends BasePlugin<"proxy:client-http-request"> {
  readonly event = "proxy:client-http-request";

  async run({ scope }: { scope: RequestScope }): Promise<void> {
    const { method, url } = scope.request.client;

    if (method !== "GET" || url !== "/health") {
      return;
    }

    const res = scope.request.client.res;

    if (!res || res.headersSent || res.writableEnded) {
      return;
    }

    // Take ownership of this request.
    scope.lifecycle.isHijacked = true;

    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        status: "ok",
        source: "mitm-core",
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

const proxy = new Proxy();

proxy.use(new LocalHealthPlugin());

void proxy.listen(8080);
