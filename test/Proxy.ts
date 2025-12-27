import Proxy from "../src/dist/Proxy.ts";
import ClientSocketErrorLoggerPlugin from "../src/plugins/log/ClientErrorLoggerPlugin.ts";
import ResponseErrorLoggerPlugin from "../src/plugins/log/ResponseErrorLoggerPlugin.ts";
import HandshakePlugin from "../src/plugins/connect/HandshakePlugin.ts";
import RequestPlugin from "../src/plugins/request/RequestPlugin.ts";

(await Proxy.registerMiddleware())
  .registerPlugins([
    // CacheRequestPlugin,
    // CacheResponsePlugin,
    // CacheConnectPlugin,
    // RequestLoggerPlugin,
    // ConnectLoggerPlugin,
    // ResponseLoggerPlugin,
    ClientSocketErrorLoggerPlugin,
    ResponseErrorLoggerPlugin,
    HandshakePlugin,
    RequestPlugin
  ])
  .initPipelines();
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
