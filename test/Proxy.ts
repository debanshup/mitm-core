import Proxy from "../src/dist/Proxy.ts";
await Proxy.registerMiddleware({ initializePipelines: true });
const proxy = new Proxy();
setInterval(() => {
  // const mem = process.memoryUsage();
  // console.log("Heap Used:", mem.heapUsed / 1024 / 1024, "MB");
}, 1000);

proxy.onTCPconnection((socket, defaultHandler) => {
  // console.time("TCP")
  defaultHandler();
  // console.timeEnd("TCP")
});
proxy.onConnect((req, socket, head, defaultHandler) => {
  // console.time("CONNECT for "+req.url);
  defaultHandler();
  // console.timeEnd("CONNECT for "+req.url);
});

proxy.onRequest((req, res, defaultHandler) => {
  // console.time("_REQ");

  defaultHandler();
  // console.timeEnd("_REQ");
});

proxy.onError((err) => {
  console.error(err.message);
});

proxy.listen(8001);
