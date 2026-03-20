const express = require("express");
const router = express.Router();
const Metric = require("../models/Metric");

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// Get list of servers
router.get("/servers", async (req, res) => {
  try {
    const servers = await Metric.distinct("serverId");
    res.json(servers);
  } catch (error) {
    console.error("Error fetching servers:", error);
    // Return empty array if DB connection fails
    res.json([]);
  }
});

module.exports = router;
