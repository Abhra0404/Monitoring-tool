const { NotificationChannels } = require("../store");
const { testChannel: testChannelService } = require("../services/notifier");

exports.getChannels = async (req, res) => {
  try {
    const channels = NotificationChannels.find(req.user._id);
    // Mask sensitive fields
    const masked = channels.map((c) => {
      const safe = { ...c };
      if (safe.config?.smtpPass) {
        safe.config = { ...safe.config, smtpPass: "••••••••" };
      }
      return safe;
    });
    res.json(masked);
  } catch (error) {
    console.error("Error fetching notification channels:", error);
    res.status(500).json({ error: "Failed to fetch notification channels" });
  }
};

exports.createChannel = async (req, res) => {
  try {
    const { type, name, config } = req.body;
    if (!type || !name || !config) {
      return res.status(400).json({ error: "type, name, and config are required" });
    }
    if (!["slack", "email"].includes(type)) {
      return res.status(400).json({ error: "type must be 'slack' or 'email'" });
    }
    if (type === "slack" && !config.webhookUrl) {
      return res.status(400).json({ error: "webhookUrl is required for Slack channels" });
    }
    if (type === "slack" && config.webhookUrl) {
      try {
        const u = new URL(config.webhookUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          return res.status(400).json({ error: "webhookUrl must use http or https" });
        }
      } catch {
        return res.status(400).json({ error: "webhookUrl is not a valid URL" });
      }
    }
    if (type === "email" && (!config.smtpHost || !config.to)) {
      return res.status(400).json({ error: "smtpHost and to are required for email channels" });
    }

    const channel = NotificationChannels.create({
      userId: req.user._id,
      type,
      name: name.trim(),
      config,
    });
    res.status(201).json(channel);
  } catch (error) {
    console.error("Error creating notification channel:", error);
    res.status(500).json({ error: "Failed to create notification channel" });
  }
};

exports.updateChannel = async (req, res) => {
  try {
    const channel = NotificationChannels.findById(req.params.channelId);
    if (!channel || channel.userId !== req.user._id) {
      return res.status(404).json({ error: "Notification channel not found" });
    }
    const { name, config } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (config) {
      // Preserve existing smtpPass if masked value sent
      if (config.smtpPass === "••••••••" && channel.config?.smtpPass) {
        config.smtpPass = channel.config.smtpPass;
      }
      updates.config = config;
    }
    const updated = NotificationChannels.update(req.params.channelId, updates);
    res.json(updated);
  } catch (error) {
    console.error("Error updating notification channel:", error);
    res.status(500).json({ error: "Failed to update notification channel" });
  }
};

exports.deleteChannel = async (req, res) => {
  try {
    const removed = NotificationChannels.delete(req.params.channelId, req.user._id);
    if (!removed) {
      return res.status(404).json({ error: "Notification channel not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting notification channel:", error);
    res.status(500).json({ error: "Failed to delete notification channel" });
  }
};

exports.toggleChannel = async (req, res) => {
  try {
    const channel = NotificationChannels.toggleActive(req.params.channelId, req.user._id);
    if (!channel) {
      return res.status(404).json({ error: "Notification channel not found" });
    }
    res.json(channel);
  } catch (error) {
    console.error("Error toggling notification channel:", error);
    res.status(500).json({ error: "Failed to toggle notification channel" });
  }
};

exports.testChannel = async (req, res) => {
  try {
    const channel = NotificationChannels.findById(req.params.channelId);
    if (!channel || channel.userId !== req.user._id) {
      return res.status(404).json({ error: "Notification channel not found" });
    }
    await testChannelService(channel);
    res.json({ success: true, message: "Test notification sent" });
  } catch (error) {
    console.error("Error testing notification channel:", error);
    res.status(500).json({ error: error.message || "Failed to send test notification" });
  }
};

module.exports = exports;
