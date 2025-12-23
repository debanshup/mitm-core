import Proxy from "../src/dist/Proxy.ts";
import type { Iplugins } from "../src/interfaces/IPlugins.ts";
import CacheConnectPlugin from "../src/plugins/cache/CacheConnectPlugin.ts";
import CacheRequestPlugin from "../src/plugins/cache/CacheRequestPlugin.ts";import CacheResponsePlugin from "../src/plugins/cache/CacheResponsePlugin.ts";
 "../src/plugins/cache/CacheConnectPlugin.ts";
import HandshakeHandler from "../src/plugins/handshake/HandshakeHandler.ts";
import type { Plugin } from "../src/plugins/PluginRegistry.ts";
import RequestHandler from "../src/plugins/request/RequestHandler.ts";
import ResponseHandler from "../src/plugins/response/ResponseHandler.ts";

await Proxy.registerMiddleware();
Proxy.registerPlugins([
  CacheRequestPlugin,
  CacheResponsePlugin,
  CacheConnectPlugin,
  HandshakeHandler,
  RequestHandler,
  ResponseHandler,
] satisfies Plugin[]);

const proxy = new Proxy();
proxy.init()
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
