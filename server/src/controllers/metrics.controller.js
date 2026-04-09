const Metric = require("../models/Metric");
const Server = require("../models/Server");
const { evaluateAlerts } = require("../services/alertEngine");

// Receive and store metrics from agent
exports.receiveMetrics = async (req, res) => {
  try {
    const {
      serverId, cpu, totalMem, freeMem, uptime,
      loadAvg1, loadAvg5, loadAvg15,
      diskTotal, diskFree,
      networkRx, networkTx,
      cpuCount, platform, arch, hostname,
    } = req.body;
    const userId = req.user._id;

    if (!serverId) {
      return res.status(400).json({ error: "serverId is required" });
    }

    // Create or update server with system info
    const memoryPercent = totalMem ? ((totalMem - freeMem) / totalMem) * 100 : 0;
    const diskPercent = diskTotal ? ((diskTotal - diskFree) / diskTotal) * 100 : 0;

    await Server.findOneAndUpdate(
      { userId, serverId },
      {
        userId,
        serverId,
        lastSeen: new Date(),
        status: determineStatus(cpu, memoryPercent, diskPercent),
        ...(cpuCount && { cpuCount }),
        ...(platform && { platform }),
        ...(arch && { arch }),
        ...(hostname && { hostname: hostname }),
      },
      { upsert: true, new: true }
    );

    const timestamp = new Date();
    const labels = { host: serverId };

    // Map all metrics into Prometheus-like multi-dimensional format
    const metricsToSave = [];
    const metricsMap = {}; // For alert engine

    function addMetric(name, value) {
      if (value === undefined || value === null) return;
      metricsToSave.push({ userId, name, value, labels, timestamp });
      metricsMap[name] = { value, labels };
    }

    addMetric("cpu_usage", cpu);
    addMetric("memory_total_bytes", totalMem);
    addMetric("memory_free_bytes", freeMem);
    addMetric("memory_usage_percent", memoryPercent);
    addMetric("system_uptime_seconds", uptime);
    addMetric("load_avg_1m", loadAvg1);
    addMetric("load_avg_5m", loadAvg5);
    addMetric("load_avg_15m", loadAvg15);
    addMetric("disk_total_bytes", diskTotal);
    addMetric("disk_free_bytes", diskFree);
    addMetric("disk_usage_percent", diskPercent);
    addMetric("network_rx_bytes_per_sec", networkRx);
    addMetric("network_tx_bytes_per_sec", networkTx);

    // Bulk insert
    if (metricsToSave.length > 0) {
      await Metric.insertMany(metricsToSave, { ordered: false });
    }

    // Evaluate alert rules server-side
    const firedAlerts = await evaluateAlerts(userId, metricsMap);

    // Emit via Socket.IO
    if (global.io) {
      global.io.to(`user:${userId}`).emit("metrics", {
        serverId,
        cpu,
        totalMem,
        freeMem,
        uptime,
        memoryPercent,
        loadAvg1,
        loadAvg5,
        loadAvg15,
        diskTotal,
        diskFree,
        diskPercent,
        networkRx,
        networkTx,
        time: timestamp.toLocaleTimeString(),
        timestamp: timestamp.getTime(),
      });

      // Broadcast fired alerts
      for (const alert of firedAlerts) {
        global.io.to(`user:${userId}`).emit("alert:fired", alert);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error receiving metrics:", error);
    res.status(500).json({ error: "Failed to save metrics" });
  }
};

// Determine server health status
function determineStatus(cpuPercent, memoryPercent, diskPercent) {
  if (cpuPercent > 90 || memoryPercent > 95 || diskPercent > 95) {
    return "offline"; // Critical
  }
  if (cpuPercent > 70 || memoryPercent > 80 || diskPercent > 85) {
    return "warning";
  }
  return "online";
}

module.exports = exports;
