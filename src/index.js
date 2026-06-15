require("dotenv").config();
const http = require("http");
const { createBot } = require("./bot");
const scheduler = require("./scheduler");

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
if (!CHAT_ID) {
  console.error("❌  TELEGRAM_CHAT_ID not set in .env");
  process.exit(1);
}

// Minimal HTTP server so Fly.io health checks pass.
// The bot itself uses Telegram long-polling (outbound) — no real HTTP needed.
const PORT = process.env.PORT || 8080;
const startedAt = new Date().toISOString();

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime(), startedAt }));
    } else {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("AI Job Agent is running.");
    }
  });
  server.listen(PORT, () => console.log(`[Health] Listening on port ${PORT}`));
  return server;
}

async function main() {
  console.log("🚀 Starting AI Job Agent…");

  // Health server (required by Fly.io)
  startHealthServer();

  // Start Telegram bot
  const bot = createBot();

  // Start daily scheduler
  scheduler.init(bot, CHAT_ID);

  await scheduler.runDigest(true);

  console.log(`✅ Agent running. Digest scheduled: ${process.env.DIGEST_CRON || "0 8 * * *"}`);
  console.log(`📨 Sending to Telegram chat: ${CHAT_ID}`);

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("\n[Main] SIGTERM received — shutting down…");
    bot.stopPolling();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    console.log("\n[Main] SIGINT received — shutting down…");
    bot.stopPolling();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
