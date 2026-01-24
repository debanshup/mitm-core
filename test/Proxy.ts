import Proxy from "../src/dist/Proxy.ts";
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

proxy.onError((err) => {
  console.error(err.message);
});

proxy.listen(8001);
