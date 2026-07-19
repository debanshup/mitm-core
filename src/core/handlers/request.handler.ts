import { BaseHandler } from "./base/base.handler";
import type { RequestScope } from "../context-manager/types";
import { UpstremInitiator } from "./transport/UpstreamInitiator";
import type { ProxyConfig } from "../../lib/Proxy";
import { getConfig } from "../../config.registry";
export class RequestHandler extends BaseHandler {
  readonly phase = "request";
  readonly config = getConfig();
  async handle(scope: RequestScope) {
    const { requestContext, sessionContext, lifecycle } = scope;

    let targetUrl: URL;

    if (sessionContext.httpVersion === "h1") {
      if (!requestContext?.req) {
        console.info("REQ not found!");
        return;
      }

      // console.info(sessionContext.proxyToUpstreamUrl)

      try {
        if (requestContext.proxyToUpstreamUrl) {
          targetUrl = new URL(requestContext.proxyToUpstreamUrl);
        } else {
          // fail safe
          if (requestContext.req.url?.startsWith("http")) {
            targetUrl = new URL(requestContext!.req.url);
          } else {
            targetUrl = new URL(
              requestContext!.req.url || "/",
              `https://${requestContext.req.headers.host}`,
            );
          }
        }
      } catch (error) {
        console.error(
          "Invalid URL:",
          requestContext.proxyToUpstreamUrl || requestContext.req.url,
        );
        requestContext.res!.statusCode = 400;
        requestContext.res!.end("Invalid URL");
        return;
      }
    
    } else {
      // if version is not defined
      console.warn(
        "[Proxy] Unhandled or missing HTTP version. Attempting fallback.",
        {
          version: sessionContext.httpVersion,
          host: requestContext.proxyToUpstreamHost,
          url: requestContext.proxyToUpstreamUrl,
        },
      );

      if (requestContext?.req && requestContext?.res) {
        console.info("[Proxy] Falling back to HTTP/1.1 processing path.");
        try {
          if (requestContext.proxyToUpstreamUrl) {
            targetUrl = new URL(requestContext.proxyToUpstreamUrl);
          } else {
            if (requestContext.req.url?.startsWith("http")) {
              targetUrl = new URL(requestContext.req.url);
            } else {
              targetUrl = new URL(
                requestContext.req.url || "/",
                `https://${requestContext.req.headers.host || "localhost"}`,
              );
            }
          }
        } catch (error) {
          console.error("[Proxy Fallback] Invalid URL calculation:", error);
          requestContext.res.statusCode = 400;
          requestContext.res.end("Bad Request: Invalid URL");
          return;
        }
      } else {
        console.error(
          "[Proxy] Critical: Unable to determine HTTP pipeline context.",
        );

        if (requestContext?.res && !requestContext.res.writableEnded) {
          requestContext.res.statusCode = 505; // HTTP Version Not Supported
          requestContext.res.end("HTTP Version Not Supported");
        }
        return;
      }
    }

    /**
     * @warning
     * don't delete any comment!
     */

 
    await UpstremInitiator.init(targetUrl, scope);
    lifecycle.nextPhase = "response";
  }
}
