import http from "http";

import net from "net";
import assert from "node:assert";
import Proxy from "../../src/dist/Proxy.js";
import { createMockHttpServer } from "../utils/createMockHttpServr.js";
await Proxy.registerMiddleware();
describe("proxy forwards HTTP GET correctly", () => {
  it("forwards request to upstream", async () => {
    // start mock upstream
    const server = createMockHttpServer();
    await new Promise<void>((resolve) =>
      server.listen(9000, () => {
        console.info("Mock server started at port 9000", server.address());
        resolve();
      })
    );

    // start proxy
    const proxy = new Proxy();
    proxy.onRequest((req, res, next) => {
      next();
    });
    proxy.onConnect((req, socket, next) => {
      console.info(req.url);
      next();
    });
    proxy.listen(8000);

    // send request via proxy
    await new Promise<void>((resolve, reject) => {
      const options = {
        host: "localhost",
        port: 8000,
        method: "GET",
        path: "http://localhost:9000",
      };

      const upstream = http.request(options, (res) => {
        let body = "";

        res.on("data", (chunk) => {
          body += chunk.toString();
        });

        res.on("end", () => {
          try {
            assert.strictEqual(body, "hello from upstream");
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
      upstream.on("error", reject);

      upstream.end();
    });

    server.close();
    proxy.close?.();
  });
});
