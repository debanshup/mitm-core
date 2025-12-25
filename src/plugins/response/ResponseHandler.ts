import http from "https";
import { Phase } from "../../core/phase/Phase.ts";
import type { ProxyContext } from "../../middleware/middleware.ts";
import { BasePlugin } from "../BasePlugin.ts";

export default class ResponsePlugin extends BasePlugin {
  static order = 25;
  static phase = Phase.RESPONSE;
  static async execute(ctx: ProxyContext) {
    // console.info(ctx.req?.headers.host)
    const { req, res } = ctx;
    // if (req?.headers.host === "www.cloudflare.com") {
    //   console.info("connecting to cloudflare")

    //   // res?.end()
    //   // return
    // }
    const upstream = http.request(
      {
        host: req?.headers.host,
        port: 443,
        method: req?.method,
        path: req?.url,
        headers: {
          ...req?.headers,
          connection: "keep-alive",
        },
      },
      (upstreamRes) => {
        // send response back to client
        res!.writeHead(upstreamRes.statusCode!, upstreamRes.headers);
        upstreamRes.pipe(res!);
      }
    );

    upstream.setNoDelay(true);

    req?.pipe(upstream);
  }
}
