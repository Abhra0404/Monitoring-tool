const { Servers, Metrics, DockerContainers } = require("../store");
const { evaluateAlerts } = require("../services/alertEngine");
const { dispatchAlert } = require("../services/notifier");

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

    const memoryPercent = totalMem ? ((totalMem - freeMem) / totalMem) * 100 : 0;
    const diskPercent = diskTotal ? ((diskTotal - diskFree) / diskTotal) * 100 : 0;

    // Upsert server
    Servers.upsert(userId, serverId, {
      lastSeen: new Date().toISOString(),
      status: determineStatus(cpu, memoryPercent, diskPercent),
      ...(cpuCount && { cpuCount }),
      ...(platform && { platform }),
      ...(arch && { arch }),
      ...(hostname && { hostname }),
    });

    const timestamp = new Date();
    const labels = { host: serverId };

    const metricsToSave = [];
    const metricsMap = {};

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

    if (metricsToSave.length > 0) {
      Metrics.insertMany(metricsToSave);
    }

    // Evaluate alert rules
    const firedAlerts = await evaluateAlerts(userId, metricsMap);

    // Emit via Socket.IO
    if (global.io) {
      global.io.to("all").emit("metrics", {
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

      for (const alert of firedAlerts) {
        global.io.to("all").emit("alert:fired", alert);
        dispatchAlert(userId, alert, "fired").catch((err) =>
          console.error("Alert notification error:", err.message)
        );
      }
    }

    // Handle Docker container data if present
    if (req.body.containers && Array.isArray(req.body.containers)) {
      DockerContainers.upsertMany(userId, serverId, req.body.containers);
      if (global.io) {
        global.io.to("all").emit("docker:metrics", {
          serverId,
          containers: req.body.containers,
        });
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error receiving metrics:", error);
    res.status(500).json({ error: "Failed to save metrics" });
  }
};

function determineStatus(cpuPercent, memoryPercent, diskPercent) {
  if (cpuPercent > 90 || memoryPercent > 95 || diskPercent > 95) return "critical";
  if (cpuPercent > 70 || memoryPercent > 80 || diskPercent > 85) return "warning";
  return "online";
}

module.exports = exports;
