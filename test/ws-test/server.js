import { createServer } from "https";
import { WebSocketServer } from "ws";
import { readFileSync } from "fs";
import { key, cert } from "./ca.js";
const PORT = 5000;

const options = {
  key,
  cert 
};

// Initialize the native HTTP infrastructure
const server = createServer(options, (req, res) => {
  res.writeHead(426, {
    "Content-Type": "text/plain",
    Connection: "Upgrade",
    Upgrade: "websocket",
  });
  res.end("Upgrade required.");
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 5 * 1024 * 1024,
});

const aliveConnections = new WeakMap();

server.on("upgrade", (req, socket, head) => {
  console.log(
    `\n📬 [Backend] Incoming upgrade handshake intercepted on URL: ${req.url}`,
  );

  if (req.headers["upgrade"]?.toLowerCase() !== "websocket") {
    console.warn(
      "⚠️ [Backend Upgrade Reject] Non-websocket upgrade requested.",
    );
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  socket.on("error", (err) => {
    console.error("💥 [Backend Socket Pre-Handshake Error]:", err.message);
  });

  wss.handleUpgrade(req, socket, head, (ws) => {
    console.log(
      "🔗 [Backend] WebSocket protocol switch completed natively. Connection open.",
    );

    aliveConnections.set(ws, true);

    ws.on("pong", () => {
      aliveConnections.set(ws, true);
    });

    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          event: "connected",
          msg: "Welcome to the hardened test backend!",
        }),
      );
    }

    ws.on("message", (message, isBinary) => {
      try {
        let incomingMessage;

        if (isBinary) {
          incomingMessage = message.toString("utf8"); // Safe buffer decoding conversion
        } else {
          incomingMessage = message.toString();
        }

        console.log(`📥 [Backend] Decoded text frame: "${incomingMessage}"`);

        if (!incomingMessage || incomingMessage.trim() === "") {
          return; // Ignore empty heartbeats or malformed frames safely
        }

        if (ws.readyState === ws.OPEN) {
          ws.send(`Echo Server payload returned: ${incomingMessage}`);
        }
      } catch (parseError) {
        console.error(
          "⚠️ [Backend Parsing Error] Failed to decode incoming frame:",
          parseError.message,
        );
      }
    });
    ws.on("close", (code, reason) => {
      console.log(
        `🛑 [Backend] Connection closed. Code: ${code} | Reason: ${reason || "None"}`,
      );
      aliveConnections.delete(ws); // Prevent memory retention leaks
    });

    ws.on("error", (err) => {
      console.error("💥 [Backend Client Socket Error]:", err.message);
      if (ws.readyState === ws.OPEN) {
        ws.close(1011, "Internal Server Error"); // RFC-compliant internal error close frame
      }
    });
  });
});

// ==========================================
// HEARTBEAT ENFORCEMENT ENGINE (Anti-Zombie Sockets)
// ==========================================
// Actively flags and tears down dead half-open TCP links that proxies can leave behind.
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (aliveConnections.get(ws) === false) {
      console.warn(
        "💀 [Backend Heartbeat Engine] Terminating unresponsive zombie socket connection.",
      );
      aliveConnections.delete(ws);
      return ws.terminate(); // Hard drop the socket link immediately
    }

    // Set status to false, expecting a 'pong' from the client before the next interval check
    aliveConnections.set(ws, false);
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  });
}, 30000); // Check every 30 seconds

// Graceful shutdown handling
server.on("close", () => {
  clearInterval(interval);
});

// Start the server
server.listen(PORT, () => {
  console.log(
    `🚀 Hardened local test WS backend listening on wss://localhost:${PORT}`,
  );
});
