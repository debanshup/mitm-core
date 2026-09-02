import { WebSocket } from "ws";
import { HttpsProxyAgent } from "https-proxy-agent"; // 🌟 Note the "Http" instead of "Https"

const PROXY_URL = "http://localhost:8001";
const TARGET_BACKEND = "wss://localhost:5000";
console.log(`🚀 Client starting up...`);
console.log(`🛰️  Routing traffic through PLAIN HTTP proxy: ${PROXY_URL}`);
console.log(`🎯 Target backend: ${TARGET_BACKEND}`);

const agent = new HttpsProxyAgent(PROXY_URL);

const ws = new WebSocket(TARGET_BACKEND, {
  agent: agent,
  rejectUnauthorized: false,
});

ws.on("open", () => {
  console.log(
    "✅ Client handshake complete! Connected via plain HTTP proxy tunnel.",
  );

  setTimeout(() => {
    const payload = "Hello from the pure HTTP/WS client!";
    console.log(`📤 Client sending text frame: "${payload}"`);
    ws.send(payload);
  }, 2000);
});

ws.on("message", (data) => {
  console.log(`📥 Client received packet from backend: "${data.toString()}"`);
});

ws.on("close", () => {
  console.log("🔒 Client connection closed cleanly.");
});

ws.on("error", (err) => {
  console.error("💥 Client network or handshake error:", err.message);
});
