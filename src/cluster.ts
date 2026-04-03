import cluster from "cluster";
import { availableParallelism } from "os";

async function startProxy(port: number) {
  const ProxyClass = (await import("../src/dist/Proxy.ts")).default;

  await ProxyClass.registerMiddleware({ initializePipelines: true });

  const proxy = new ProxyClass();

  proxy.onTCPconnection((socket, cb) => {
    cb();
  });

  proxy.onConnect((req, socket, head, cb) => {
    cb();
  });

  proxy.onRequest((req, res, cb) => {
    cb();
  });

  proxy.onError((err) => {
    console.error(err.message);
  });

  proxy.listen(port);
}

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);

  for (let i = 0; i < availableParallelism(); i++) {
    // const element = array[i];
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
  await startProxy(8001);
}
