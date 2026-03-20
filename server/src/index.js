// index.js
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const { initSocket } = require("./sockets");
const authRoutes = require("./routes/auth.routes");
const serversRoutes = require("./routes/servers.routes");
const metricsController = require("./controllers/metrics.controller");
const { authenticateApiKey } = require("./middleware/auth.middleware");

const app = express();
app.use(cors());
app.use(express.json());

// Public routes
app.use("/api/auth", authRoutes);

// Protected routes
app.use("/api/servers", serversRoutes);

// Agent metrics endpoint (uses API key auth)
app.post("/metrics", authenticateApiKey, metricsController.receiveMetrics);

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

server.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.PORT}`)
);