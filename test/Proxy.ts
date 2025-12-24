import Proxy from "../src/dist/Proxy.ts";
import type { Iplugins } from "../src/interfaces/IPlugins.ts";
import CacheConnectPlugin from "../src/plugins/cache/CacheConnectPlugin.ts";
import CacheRequestPlugin from "../src/plugins/cache/CacheRequestPlugin.ts";
import CacheResponsePlugin from "../src/plugins/cache/CacheResponsePlugin.ts";
import HandshakeHandler from "../src/plugins/handshake/HandshakePlugin.ts";
import type { Plugin } from "../src/plugins/PluginRegistry.ts";
import ConnectLoggerPlugin from "../src/plugins/log/ConnectLoggerPlugin.ts";
import RequestHandler from "../src/plugins/request/RequestHandler.ts";
import RequestLoggerPlugin from "../src/plugins/log/RequestLoggerPlugin.ts";
import ResponseHandler from "../src/plugins/response/ResponseHandler.ts";
import ResponseLoggerPlugin from "../src/plugins/log/ResponseLoggerPlugin.ts";
import ClientSocketErrorLoggerPlugin from "../src/plugins/log/ClientErrorLoggerPlugin.ts";
import ResponseErrorLoggerPlugin from "../src/plugins/log/ResponseErrorLoggerPlugin.ts";

(await Proxy.registerMiddleware())
  .registerPlugins([
    // CacheRequestPlugin,
    // CacheResponsePlugin,
    // CacheConnectPlugin,
    // HandshakeHandler,
    // RequestLoggerPlugin,
    // ConnectLoggerPlugin,
    ResponseLoggerPlugin,
    ClientSocketErrorLoggerPlugin,
    ResponseErrorLoggerPlugin,
  ])
  .initPipelines();
const proxy = new Proxy();

proxy.onTCPconnection((socket, next) => {
  next();
});
proxy.onConnect((req, socket, head, next) => {
  next();
});

proxy.onRequest((req, res, next) => {
  next();
});

proxy.listen(8081);
