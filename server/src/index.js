const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const { initSocket } = require("./sockets");
const authRoutes = require("./routes/auth.routes");
const serversRoutes = require("./routes/servers.routes");
const alertsRoutes = require("./routes/alerts.routes");
const metricsController = require("./controllers/metrics.controller");
const { authenticateApiKey } = require("./middleware/auth.middleware");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  res.json({
    status: dbState === 1 ? "healthy" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: dbState === 1 ? "connected" : "disconnected",
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

// Agent metrics endpoint (rate limited + API key auth)
app.post("/metrics", rateLimiter, authenticateApiKey, metricsController.receiveMetrics);

const server = http.createServer(app);
const io = initSocket(server);

// Make io global for use in controllers
global.io = io;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("DB connected");
  })
  .catch((err) => {
    console.log("DB connection error:", err.message);
  });

const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);

// Graceful shutdown
function shutdown() {
  console.log("\nShutting down gracefully...");
  server.close(() => {
    mongoose.connection.close(false).then(() => {
      console.log("Server shut down.");
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 10000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);