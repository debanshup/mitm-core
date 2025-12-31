import { RequestHandler } from "../src/core/handlers/request.handler.ts";
import { ResponseHandler } from "../src/core/handlers/response.handler.ts";
import Proxy from "../src/dist/Proxy.ts";
import ClientSocketErrorLoggerPlugin from "../src/plugins/log/clientErrorLogger.plugin.ts";
import ResponseErrorLoggerPlugin from "../src/plugins/log/responseErrorLogger.plugin.ts";

(await Proxy.registerMiddleware()).initPipelines();
const proxy = new Proxy();

proxy.onTCPconnection((socket, next) => {
  // console.time("TCP")
  next();
  // console.timeEnd("TCP")
});
proxy.onConnect((req, socket, head, next) => {
  // console.time("CONNECT for "+req.url);
  next();
  // console.timeEnd("CONNECT for "+req.url);
});

proxy.onRequest((req, res, next) => {
  // console.time("_REQ");

  next();
  // console.timeEnd("_REQ");
});

proxy.listen(8081);
