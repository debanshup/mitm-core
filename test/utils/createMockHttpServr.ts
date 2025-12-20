import http from "http";

export function createMockHttpServer() {
  const server = http.createServer( (req, res) => {
    req.on("data", (d: Buffer) => {
      console.info(d.toString("utf-8"));
    });
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("hello from upstream");
  });
  return server;
}
