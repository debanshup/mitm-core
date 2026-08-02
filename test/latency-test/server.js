import { createServer } from "http";

const PORT = 5000; // Make sure this matches what your proxy points to

const server = createServer((req, res) => {
  let body = [];

  // Collect request body data if present
  req.on("data", (chunk) => {
    body.push(chunk);
  });

  req.on("end", () => {
    body = Buffer.concat(body).toString();

    // 1. Log incoming request details to the console for debugging
    console.log(`\n============== [INCOMING REQUEST] ==============`);
    console.log(`Method : ${req.method}`);
    console.log(`URL    : ${req.url}`);
    console.log(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
    if (body) {
      console.log(`Body   : ${body}`);
    }
    console.log(`=================================================`);

    // 2. Route handling for different test endpoints
    res.setHeader("Content-Type", "application/json");

    if (req.url === "/test" && req.method === "GET") {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          status: "success",
          message: "Proxy successfully forwarded the GET request!",
        }),
      );
    } else if (req.url === "/echo" && req.method === "POST") {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          status: "success",
          message: "Proxy successfully forwarded the POST request!",
          receivedData: body ? JSON.parse(body) : null,
        }),
      );
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Route not found" }));
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`🚀 Local test backend listening on http://localhost:${PORT}`);
});
