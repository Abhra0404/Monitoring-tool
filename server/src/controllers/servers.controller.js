const Server = require("../models/Server");
const Metric = require("../models/Metric");

// Get all servers for a user
exports.getServers = async (req, res) => {
  try {
    const servers = await Server.find({ userId: req.user._id })
      .sort({ lastSeen: -1 })
      .lean();

    // Mark servers as offline if not seen in 60 seconds
    const now = Date.now();
    for (const s of servers) {
      if (now - new Date(s.lastSeen).getTime() > 60000 && s.status !== "offline") {
        s.status = "offline";
      }
    }

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

// Get server metrics with smart downsampling for longer ranges
exports.getServerMetrics = async (req, res) => {
  try {
    const { serverId } = req.params;
    const { timeRange = "5m" } = req.query;

    const now = new Date();
    let startTime;
    let maxPoints = 300; // Target data points for smooth charts

    switch (timeRange) {
      case "5m":
        startTime = new Date(now.getTime() - 5 * 60 * 1000);
        maxPoints = 150;
        break;
      case "15m":
        startTime = new Date(now.getTime() - 15 * 60 * 1000);
        maxPoints = 180;
        break;
      case "1h":
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        maxPoints = 240;
        break;
      case "6h":
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        maxPoints = 360;
        break;
      case "24h":
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        maxPoints = 480;
        break;
      case "7d":
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        maxPoints = 500;
        break;
      default:
        startTime = new Date(now.getTime() - 5 * 60 * 1000);
    }

    const rawMetrics = await Metric.find({
      userId: req.user._id,
      "labels.host": serverId,
      timestamp: { $gte: startTime },
    })
      .sort({ timestamp: 1 })
      .lean();

    // Group metrics by timestamp into flat records
    const grouped = {};
    for (const m of rawMetrics) {
      const timeMs = m.timestamp.getTime();
      if (!grouped[timeMs]) {
        grouped[timeMs] = { timestamp: timeMs };
      }
      grouped[timeMs][m.name] = m.value;
    }

    let metrics = Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);

    // Downsample if too many points — average within time buckets
    if (metrics.length > maxPoints) {
      metrics = downsample(metrics, maxPoints);
    }

    // Map to frontend-friendly format
    const result = metrics.map((m) => ({
      timestamp: m.timestamp,
      cpu: m.cpu_usage,
      totalMem: m.memory_total_bytes,
      freeMem: m.memory_free_bytes,
      memoryPercent: m.memory_usage_percent,
      uptime: m.system_uptime_seconds,
      loadAvg1: m.load_avg_1m,
      loadAvg5: m.load_avg_5m,
      loadAvg15: m.load_avg_15m,
      diskTotal: m.disk_total_bytes,
      diskFree: m.disk_free_bytes,
      diskPercent: m.disk_usage_percent,
      networkRx: m.network_rx_bytes_per_sec,
      networkTx: m.network_tx_bytes_per_sec,
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
};

// LTTB-inspired downsampling
function downsample(data, targetPoints) {
  if (data.length <= targetPoints) return data;

  const bucketSize = Math.ceil(data.length / targetPoints);
  const result = [];

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, i + bucketSize);
    const avg = {};
    const count = bucket.length;

    for (const point of bucket) {
      for (const [key, val] of Object.entries(point)) {
        if (typeof val === "number") {
          avg[key] = (avg[key] || 0) + val / count;
        }
      }
    }
    // Use middle bucket's timestamp for accuracy
    avg.timestamp = bucket[Math.floor(count / 2)].timestamp;
    result.push(avg);
  }

  return result;
}

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

    await Metric.deleteMany({ userId: req.user._id, "labels.host": serverId });

    res.json({ message: "Server deleted successfully" });
  } catch (error) {
    console.error("Error deleting server:", error);
    res.status(500).json({ error: "Failed to delete server" });
  }
};
