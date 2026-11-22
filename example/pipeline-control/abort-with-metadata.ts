import {
  BasePlugin,
  type RequestScope,
  PipelineAbortSignal,
  Proxy,
} from "../../src";

class RequestValidationPlugin extends BasePlugin<"proxy:client-http-request"> {
  readonly event = "proxy:client-http-request";

  async run({ scope }: { scope: RequestScope }): Promise<void> {
    const url = scope.request.client.url ?? "";

    if (!url.startsWith("/api/")) {
      return;
    }

    const token = scope.request.client.headers?.["x-api-token"];

    if (typeof token === "string" && token.length > 0) {
      return;
    }

    const res = scope.request.client.res;

    if (res && !res.headersSent && !res.writableEnded) {
      res.writeHead(401, {
        "Content-Type": "application/json",
      });

      res.end(
        JSON.stringify({
          error: "Unauthorized",
          message: "Missing API token",
        }),
      );
    }

    throw new PipelineAbortSignal({
      message: "Request rejected: API token missing",
      reason: "policy",
      plugin: this,
      event: this.event,
      cause: new Error("Missing x-api-token header"),
    });
  }
}

const proxy = new Proxy();

proxy.use(new RequestValidationPlugin());

void proxy.listen(8080);
