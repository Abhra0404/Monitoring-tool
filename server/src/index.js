const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
require("dotenv").config();

// Initialize the in-memory store (loads persisted data from ~/.theoria/store.json)
require("./store");

const { initSocket } = require("./sockets");
const authRoutes = require("./routes/auth.routes");
const serversRoutes = require("./routes/servers.routes");
const alertsRoutes = require("./routes/alerts.routes");
const httpChecksRoutes = require("./routes/httpChecks.routes");
const pipelinesRoutes = require("./routes/pipelines.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const dockerRoutes = require("./routes/docker.routes");
const statusPageRoutes = require("./routes/statusPage.routes");
const metricsController = require("./controllers/metrics.controller");
const { authenticateApiKey } = require("./middleware/auth.middleware");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    storage: "in-memory",
  });
});

// Simple in-memory rate limiter for metric ingestion
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 10; // max requests per window per API key

function rateLimiter(req, res, next) {
  const key = req.headers.authorization || req.ip;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { windowStart: now, count: 1 });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Too many requests" });
  }
  next();
}

// Clean up rate limit entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(key);
    }
  }
}, 60000);

// Public routes
app.use("/api/auth", authRoutes);

// Protected routes
app.use("/api/servers", serversRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/http-checks", httpChecksRoutes);
app.use("/api/pipelines", pipelinesRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/docker", dockerRoutes);
app.use("/api/status-page", statusPageRoutes);

// Agent metrics endpoint (rate limited + API key auth)
app.post("/metrics", rateLimiter, authenticateApiKey, metricsController.receiveMetrics);

// ── Serve React client build (Jenkins-style: single process, single port) ──
// Look for client build in multiple possible locations
const clientBuildPaths = [
  path.join(__dirname, "../../client/build"),       // dev: repo root
  path.join(__dirname, "../client/build"),           // alt structure
  process.env.CLIENT_BUILD_PATH,                     // explicit override
].filter(Boolean);

const clientBuildDir = clientBuildPaths.find((p) => fs.existsSync(path.join(p, "index.html")));

if (clientBuildDir) {
  app.use(express.static(clientBuildDir));
  // SPA fallback — any non-API route serves index.html
  app.get("/{*splat}", (req, res) => {
    res.sendFile(path.join(clientBuildDir, "index.html"));
  });
  console.log(`Serving dashboard from ${clientBuildDir}`);
} else {
  app.get("/", (req, res) => {
    res.json({
      name: "Theoria API",
      version: "1.0.0",
      status: "running",
      message: "Dashboard not built. Run: npm run build --prefix client",
    });
  });
}

const server = http.createServer(app);
const io = initSocket(server);

// Make io global for use in controllers
global.io = io;

// Start HTTP check runner (must be after global.io is set)
const { startAll: startHttpChecks } = require("./services/httpCheckRunner");
startHttpChecks();

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () =>
  console.log(`Server running on ${HOST}:${PORT}`)
);

// Graceful shutdown
function shutdown() {
  console.log("\nShutting down gracefully...");
  server.close(() => {
    console.log("Server shut down.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);