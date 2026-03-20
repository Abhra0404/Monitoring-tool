const Server = require("../models/Server");
const Metric = require("../models/Metric");

// Get all servers for a user
exports.getServers = async (req, res) => {
  try {
    const servers = await Server.find({ userId: req.user._id })
      .sort({ lastSeen: -1 })
      .lean();

    res.json(servers);
  } catch (error) {
    console.error("Error fetching servers:", error);
    res.status(500).json({ error: "Failed to fetch servers" });
  }
};

// Get single server details
exports.getServer = async (req, res) => {
  try {
    const { serverId } = req.params;

    const server = await Server.findOne({
      userId: req.user._id,
      serverId,
    }).lean();

    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    res.json(server);
  } catch (error) {
    console.error("Error fetching server:", error);
    res.status(500).json({ error: "Failed to fetch server" });
  }
};

// Get server metrics
exports.getServerMetrics = async (req, res) => {
  try {
    const { serverId } = req.params;
    const { timeRange = "5m" } = req.query;

    // Calculate time range
    const now = new Date();
    let startTime;

    switch (timeRange) {
      case "5m":
        startTime = new Date(now.getTime() - 5 * 60 * 1000);
        break;
      case "1h":
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case "24h":
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 5 * 60 * 1000);
    }

    const metrics = await Metric.find({
      userId: req.user._id,
      serverId,
      timestamp: { $gte: startTime },
    })
      .sort({ timestamp: 1 })
      .limit(1000)
      .lean();

    res.json(metrics);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
};

// Update server name
exports.updateServer = async (req, res) => {
  try {
    const { serverId } = req.params;
    const { name } = req.body;

    const server = await Server.findOneAndUpdate(
      { userId: req.user._id, serverId },
      { name },
      { new: true }
    );

    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    res.json(server);
  } catch (error) {
    console.error("Error updating server:", error);
    res.status(500).json({ error: "Failed to update server" });
  }
};

// Delete server
exports.deleteServer = async (req, res) => {
  try {
    const { serverId } = req.params;

    const server = await Server.findOneAndDelete({
      userId: req.user._id,
      serverId,
    });

    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    // Also delete all metrics for this server
    await Metric.deleteMany({ userId: req.user._id, serverId });

    res.json({ message: "Server deleted successfully" });
  } catch (error) {
    console.error("Error deleting server:", error);
    res.status(500).json({ error: "Failed to delete server" });
  }
};
