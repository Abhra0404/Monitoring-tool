const { AlertRules, AlertHistory } = require("../store");

// Get alert rules for a user, optionally filtered by serverId
exports.getAlertRules = async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user._id;

    const filter = { userId };
    if (serverId) {
      filter["labels.host"] = serverId;
    }

    const alertRules = AlertRules.find(filter);
    res.json(alertRules);
  } catch (error) {
    console.error("Error fetching alert rules:", error);
    res.status(500).json({ error: "Failed to fetch alert rules" });
  }
};

// Get all alert rules (no server filter)
exports.getAllAlertRules = async (req, res) => {
  try {
    const rules = AlertRules.find({ userId: req.user._id });
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

    const thresholdNum = Number(threshold);
    if (!Number.isFinite(thresholdNum)) {
      return res.status(400).json({ error: "threshold must be a finite number" });
    }
    threshold = thresholdNum;

    if (durationMinutes != null) {
      const d = Number(durationMinutes);
      if (!Number.isFinite(d) || d < 0) {
        return res.status(400).json({ error: "durationMinutes must be a non-negative number" });
      }
      durationMinutes = d;
    }

    if (serverId && (!labels || !labels.host)) {
      labels = { ...(labels || {}), host: serverId };
    }

    const alertRule = AlertRules.upsert(userId, name, {
      userId,
      name,
      metricName,
      labels: labels || {},
      operator,
      threshold: Number(threshold),
      durationMinutes: Number(durationMinutes) || 0,
      isActive: isActive !== undefined ? isActive : true,
    });

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

    const rule = AlertRules.delete(ruleId, userId);
    if (!rule) {
      return res.status(404).json({ error: "Alert rule not found" });
    }

    // Resolve any firing alerts for this rule
    AlertHistory.resolveByRuleId(rule._id);

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

    const rule = AlertRules.toggleActive(ruleId, userId);
    if (!rule) {
      return res.status(404).json({ error: "Alert rule not found" });
    }

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

    const alerts = AlertHistory.find(filter, Math.min(Number(limit), 200));
    res.json(alerts);
  } catch (error) {
    console.error("Error fetching alert history:", error);
    res.status(500).json({ error: "Failed to fetch alert history" });
  }
};

// Get count of currently firing alerts
exports.getActiveAlertCount = async (req, res) => {
  try {
    const count = AlertHistory.countFiring(req.user._id);
    res.json({ count });
  } catch (error) {
    console.error("Error counting active alerts:", error);
    res.status(500).json({ error: "Failed to count alerts" });
  }
};
