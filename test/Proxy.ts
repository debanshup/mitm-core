import Proxy from "../src/dist/Proxy.ts";

await Proxy.registerMiddleware();

const proxy = new Proxy();

proxy.onConnect((req, socket, head, next) => {
  next();
});

proxy.onRequest((req, res, next) => {
  // console.log('req', req)
  next();
});

proxy.listen(8081);
