const AlertRule = require("../models/AlertRule");

exports.getAlertRule = async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user._id;

    const alertRule = await AlertRule.findOne({ userId, serverId }).lean();

    if (!alertRule) {
      return res.json({
        serverId,
        cpuThreshold: 80,
        memoryThreshold: 90,
      });
    }

    res.json(alertRule);
  } catch (error) {
    console.error("Error fetching alert rule:", error);
    res.status(500).json({ error: "Failed to fetch alert rule" });
  }
};

exports.upsertAlertRule = async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user._id;
    const { cpuThreshold, memoryThreshold } = req.body;

    if (cpuThreshold == null || memoryThreshold == null) {
      return res
        .status(400)
        .json({ error: "cpuThreshold and memoryThreshold are required" });
    }

    const safeCpuThreshold = Number(cpuThreshold);
    const safeMemoryThreshold = Number(memoryThreshold);

    if (
      Number.isNaN(safeCpuThreshold) ||
      Number.isNaN(safeMemoryThreshold) ||
      safeCpuThreshold < 1 ||
      safeCpuThreshold > 100 ||
      safeMemoryThreshold < 1 ||
      safeMemoryThreshold > 100
    ) {
      return res
        .status(400)
        .json({ error: "Thresholds must be numbers between 1 and 100" });
    }

    const alertRule = await AlertRule.findOneAndUpdate(
      { userId, serverId },
      {
        userId,
        serverId,
        cpuThreshold: safeCpuThreshold,
        memoryThreshold: safeMemoryThreshold,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(alertRule);
  } catch (error) {
    console.error("Error saving alert rule:", error);
    res.status(500).json({ error: "Failed to save alert rule" });
  }
};
