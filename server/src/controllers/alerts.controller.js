const AlertRule = require("../models/AlertRule");
const AlertHistory = require("../models/AlertHistory");

// Get alert rules for a user, optionally filtered by serverId
exports.getAlertRules = async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user._id;

    const filter = { userId };
    if (serverId) {
      filter["labels.host"] = serverId;
    }

    const alertRules = await AlertRule.find(filter).sort({ createdAt: -1 }).lean();
    res.json(alertRules);
  } catch (error) {
    console.error("Error fetching alert rules:", error);
    res.status(500).json({ error: "Failed to fetch alert rules" });
  }
};

// Get all alert rules (no server filter)
exports.getAllAlertRules = async (req, res) => {
  try {
    const rules = await AlertRule.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json(rules);
  } catch (error) {
    console.error("Error fetching alert rules:", error);
    res.status(500).json({ error: "Failed to fetch alert rules" });
  }
};

// Create or update an alert rule
exports.upsertAlertRule = async (req, res) => {
  try {
    const userId = req.user._id;
    const { serverId } = req.params;
    let { name, metricName, labels, operator, threshold, durationMinutes, isActive } = req.body;

    if (!name || !metricName || !operator || threshold == null) {
      return res.status(400).json({
        error: "Missing required fields: name, metricName, operator, threshold",
      });
    }

    // Ensure labels includes the server's host if serverId is provided
    if (serverId && (!labels || !labels.host)) {
      labels = { ...(labels || {}), host: serverId };
    }

    const alertRule = await AlertRule.findOneAndUpdate(
      { userId, name },
      {
        userId,
        name,
        metricName,
        labels: labels || {},
        operator,
        threshold: Number(threshold),
        durationMinutes: Number(durationMinutes) || 0,
        isActive: isActive !== undefined ? isActive : true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(alertRule);
  } catch (error) {
    console.error("Error saving alert rule:", error);
    res.status(500).json({ error: "Failed to save alert rule" });
  }
};

// Delete an alert rule
exports.deleteAlertRule = async (req, res) => {
  try {
    const userId = req.user._id;
    const { ruleId } = req.params;

    const rule = await AlertRule.findOneAndDelete({ _id: ruleId, userId });
    if (!rule) {
      return res.status(404).json({ error: "Alert rule not found" });
    }

    // Also clear any firing alerts for this rule
    await AlertHistory.updateMany(
      { ruleId: rule._id, status: "firing" },
      { status: "resolved", resolvedAt: new Date() }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting alert rule:", error);
    res.status(500).json({ error: "Failed to delete alert rule" });
  }
};

// Toggle alert rule active/inactive
exports.toggleAlertRule = async (req, res) => {
  try {
    const userId = req.user._id;
    const { ruleId } = req.params;

    const rule = await AlertRule.findOne({ _id: ruleId, userId });
    if (!rule) {
      return res.status(404).json({ error: "Alert rule not found" });
    }

    rule.isActive = !rule.isActive;
    await rule.save();

    res.json(rule);
  } catch (error) {
    console.error("Error toggling alert rule:", error);
    res.status(500).json({ error: "Failed to toggle alert rule" });
  }
};

// Get alert history
exports.getAlertHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, limit = 50 } = req.query;

    const filter = { userId };
    if (status) filter.status = status;

    const alerts = await AlertHistory.find(filter)
      .sort({ firedAt: -1 })
      .limit(Math.min(Number(limit), 200))
      .lean();

    res.json(alerts);
  } catch (error) {
    console.error("Error fetching alert history:", error);
    res.status(500).json({ error: "Failed to fetch alert history" });
  }
};

// Get count of currently firing alerts
exports.getActiveAlertCount = async (req, res) => {
  try {
    const count = await AlertHistory.countDocuments({
      userId: req.user._id,
      status: "firing",
    });
    res.json({ count });
  } catch (error) {
    console.error("Error counting active alerts:", error);
    res.status(500).json({ error: "Failed to count alerts" });
  }
};
