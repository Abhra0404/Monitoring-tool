const { HttpChecks } = require("../store");
const { scheduleCheck, unscheduleCheck, rescheduleCheck } = require("../services/httpCheckRunner");

exports.getChecks = async (req, res) => {
  try {
    const checks = HttpChecks.find(req.user._id);
    // Strip results array for list view (keep payload small)
    const summary = checks.map(({ results, ...rest }) => rest);
    res.json(summary);
  } catch (error) {
    console.error("Error fetching HTTP checks:", error);
    res.status(500).json({ error: "Failed to fetch HTTP checks" });
  }
};

exports.getCheck = async (req, res) => {
  try {
    const check = HttpChecks.findById(req.params.checkId);
    if (!check || check.userId !== req.user._id) {
      return res.status(404).json({ error: "HTTP check not found" });
    }
    res.json(check);
  } catch (error) {
    console.error("Error fetching HTTP check:", error);
    res.status(500).json({ error: "Failed to fetch HTTP check" });
  }
};

exports.createCheck = async (req, res) => {
  try {
    const { name, url, interval, expectedStatus } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: "name and url are required" });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    const check = HttpChecks.create({
      userId: req.user._id,
      name: name.trim(),
      url: url.trim(),
      interval: Number(interval) || 60000,
      expectedStatus: Number(expectedStatus) || 200,
    });

    scheduleCheck(check);
    res.status(201).json(check);
  } catch (error) {
    console.error("Error creating HTTP check:", error);
    res.status(500).json({ error: "Failed to create HTTP check" });
  }
};

exports.deleteCheck = async (req, res) => {
  try {
    const removed = HttpChecks.delete(req.params.checkId, req.user._id);
    if (!removed) {
      return res.status(404).json({ error: "HTTP check not found" });
    }
    unscheduleCheck(req.params.checkId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting HTTP check:", error);
    res.status(500).json({ error: "Failed to delete HTTP check" });
  }
};

exports.toggleCheck = async (req, res) => {
  try {
    const check = HttpChecks.toggleActive(req.params.checkId, req.user._id);
    if (!check) {
      return res.status(404).json({ error: "HTTP check not found" });
    }
    if (check.isActive) {
      scheduleCheck(check);
    } else {
      unscheduleCheck(check._id);
    }
    res.json(check);
  } catch (error) {
    console.error("Error toggling HTTP check:", error);
    res.status(500).json({ error: "Failed to toggle HTTP check" });
  }
};

module.exports = exports;
