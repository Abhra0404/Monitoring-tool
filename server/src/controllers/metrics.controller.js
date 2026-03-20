const Metric = require("../models/Metric");
const Server = require("../models/Server");

// Receive and store metrics from agent
exports.receiveMetrics = async (req, res) => {
  try {
    const { serverId, cpu, totalMem, freeMem, uptime } = req.body;
    const userId = req.user._id;

    if (!serverId) {
      return res.status(400).json({ error: "serverId is required" });
    }

    // Create or update server
    const server = await Server.findOneAndUpdate(
      { userId, serverId },
      {
        userId,
        serverId,
        lastSeen: new Date(),
        status: determineStatus(cpu, totalMem, freeMem),
      },
      { upsert: true, new: true }
    );

    // Save metric
    const metric = await Metric.create({
      userId,
      serverId,
      cpu,
      totalMem,
      freeMem,
      uptime,
      timestamp: new Date(),
    });

    // Emit via Socket.IO (will be handled in main server)
    if (global.io) {
      // Emit to specific user room
      global.io.to(`user:${userId}`).emit("metrics", {
        serverId,
        cpu,
        totalMem,
        freeMem,
        uptime,
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
      });
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error receiving metrics:", error);
    res.status(500).json({ error: "Failed to save metrics" });
  }
};

// Helper function to determine server status
function determineStatus(cpu, totalMem, freeMem) {
  const memoryPercent = ((totalMem - freeMem) / totalMem) * 100;
  const cpuPercent = Math.min(100, (cpu || 0) * 10);

  if (cpuPercent > 80 || memoryPercent > 90) {
    return "offline"; // Critical
  } else if (cpuPercent > 60 || memoryPercent > 75) {
    return "warning";
  }
  return "online";
}

module.exports = exports;
