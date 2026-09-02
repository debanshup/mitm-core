import { BaseHandler } from "./base/base.handler";
import type { RequestScope } from "../scope/types";
import { UpstreamInitiator} from "../transport/http1/UpstreamInitiator";
import { getConfig } from "../../config.registry";
import { pluginEventManager } from "../event/plugin-events/pluginEvents";
import { ScopeMutator } from "../scope/ScopeMutator";
export class RequestHandler extends BaseHandler {
  readonly phase = "request";
  readonly config = getConfig();
  async handle(scope: RequestScope) {
    const { request, session } = scope;
    let targetUrl: URL;

    if (session.protocol.httpVersion === "h1") {
      if (!request.client.req) {
        console.info("REQ not found!");
        return;
      }

      try {
        if (request.target.url) {
          targetUrl = new URL(request.target.url);
        } else {
          if (request.client.req.url?.startsWith("http")) {
            targetUrl = new URL(request.client.req.url);
          } else {
            targetUrl = new URL(
              request.client.req.url || "/",
              `https://${request.client.req.headers.host}`,
            );
          }
        }
      } catch (error) {
        console.error(
          "Invalid URL:",
          request.target.url || request.client.req.url,
        );

        if (request.client.res) {
          request.client.res.statusCode = 400;
          request.client.res.end("Invalid URL");
        }

        return;
      }
    } else {
      console.warn(
        "[RequestHandler] Unhandled or missing HTTP version. Attempting fallback.",
        {
          version: session.protocol.httpVersion,
          host: request.target.host,
          url: request.target.url,
        },
      );

      if (request.client.req && request.client.res) {
        console.info(
          "[RequestHandler] Falling back to HTTP/1.1 processing path.",
        );

        try {
          if (request.target.url) {
            targetUrl = new URL(request.target.url);
          } else {
            if (request.client.req.url?.startsWith("http")) {
              targetUrl = new URL(request.client.req.url);
            } else {
              targetUrl = new URL(
                request.client.req.url || "/",
                `https://${request.client.req.headers.host || "localhost"}`,
              );
            }
          }
        } catch (error) {
          console.error("[Proxy Fallback] Invalid URL calculation:", error);
          request.client.res.statusCode = 400;
          request.client.res.end("Bad Request: Invalid URL");

          return;
        }
      } else {
        console.error(
          "[RequestHandler] Critical: Unable to determine HTTP pipeline context.",
        );

        if (request.client.res && !request.client.res.writableEnded) {
          request.client.res.statusCode = 505;
          request.client.res.end("HTTP Version Not Supported");
        }

        return;
      }
    }

    const h1UpstreamReq = await UpstreamInitiator.initH1UpstreamReq(
      targetUrl,
      scope,
    );
    const success = ScopeMutator.applyUpstreamInitState(scope, h1UpstreamReq);
      if (!success) {
        return;
      }
      await pluginEventManager.emitAsync("proxy:upstream-dispatch", { scope });
  }
}
