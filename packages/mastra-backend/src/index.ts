/**
 * Mastra backend entry point.
 *
 * Runs an HTTP + WebSocket server that implements the same API
 * as the Python FastAPI backend, so the Sanity Studio plugin
 * can connect to either backend by changing one URL.
 *
 * Default port: 4111 (configurable via PORT env var)
 */

import "dotenv/config";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { handleConversationWs } from "./services/conversation.js";

const PORT = parseInt(process.env.PORT || "4111", 10);

// ─── HTTP server (health check + CORS preflight) ─────────────

const httpServer = createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === "/api/health" || url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        backend: "mastra",
        version: "0.1.0",
      })
    );
    return;
  }

  // 404 for everything else — WS connections go through the upgrade handler
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ─── WebSocket server ─────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://localhost:${PORT}`);

  // Match: /api/conversations/{id}/ws
  const match = url.pathname.match(
    /^\/api\/conversations\/([^/]+)\/ws$/
  );

  if (!match) {
    socket.destroy();
    return;
  }

  const conversationId = match[1];

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request, conversationId);
  });
});

wss.on("connection", (ws: WebSocket, _request: any, conversationId: string) => {
  console.log(`[WS] New connection for conversation: ${conversationId}`);

  handleConversationWs(ws, conversationId).catch((err) => {
    console.error(`[WS] Handler error: ${err.message}`);
    try {
      ws.send(
        JSON.stringify({
          type: "error",
          message: err.message,
          timestamp: new Date().toISOString(),
        })
      );
      ws.close(1011);
    } catch {
      // Already closed
    }
  });
});

// ─── Start ────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`
╭────────────────────────────────────────────╮
│                                            │
│   🤖 Mastra Backend                        │
│                                            │
│   HTTP:  http://localhost:${PORT}             │
│   WS:    ws://localhost:${PORT}/api/...       │
│                                            │
│   Health: /api/health                      │
│   WS:     /api/conversations/{id}/ws       │
│                                            │
╰────────────────────────────────────────────╯
`);
});
