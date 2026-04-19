const { StatusPageConfig, Servers, HttpChecks, SYSTEM_USER_ID } = require("../store");

exports.getPublicStatus = async (req, res) => {
  try {
    const config = StatusPageConfig.get(SYSTEM_USER_ID);
    if (!config || !config.isPublic) {
      return res.status(404).json({ error: "Status page is not enabled" });
    }

    const servers = Servers.find(SYSTEM_USER_ID);
    const httpChecks = HttpChecks.find(SYSTEM_USER_ID).map(({ results, ...rest }) => rest);

    // Compute overall status
    const serverStatuses = servers.map((s) => s.status);
    const checkStatuses = httpChecks.filter((c) => c.isActive).map((c) => c.status);
    const allStatuses = [...serverStatuses, ...checkStatuses];

    let overall = "operational";
    const hasDown = allStatuses.includes("offline") || allStatuses.includes("down");
    const hasWarning = allStatuses.includes("warning");
    if (hasDown) overall = allStatuses.filter((s) => s === "offline" || s === "down").length > allStatuses.length / 2 ? "major_outage" : "partial_outage";
    else if (hasWarning) overall = "degraded";

    res.json({
      title: config.title || "System Status",
      description: config.description || "",
      overall,
      servers: servers.map((s) => ({
        name: s.name || s.serverId,
        status: s.status,
        lastSeen: s.lastSeen,
      })),
      httpChecks: httpChecks.filter((c) => c.isActive).map((c) => ({
        name: c.name,
        url: c.url,
        status: c.status,
        uptimePercent: c.uptimePercent,
        lastCheckedAt: c.lastCheckedAt,
      })),
      customServices: config.customServices || [],
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching public status:", error);
    res.status(500).json({ error: "Failed to fetch status" });
  }
};

exports.getStatusConfig = async (req, res) => {
  try {
    const config = StatusPageConfig.get(req.user._id) || {
      title: "System Status",
      description: "",
      isPublic: false,
      customServices: [],
    };
    res.json(config);
  } catch (error) {
    console.error("Error fetching status page config:", error);
    res.status(500).json({ error: "Failed to fetch status page config" });
  }
};

exports.updateStatusConfig = async (req, res) => {
  try {
    const { title, description, isPublic, customServices } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (isPublic !== undefined) updates.isPublic = isPublic;
    if (customServices !== undefined) updates.customServices = customServices;

    const config = StatusPageConfig.upsert(req.user._id, updates);
    res.json(config);
  } catch (error) {
    console.error("Error updating status page config:", error);
    res.status(500).json({ error: "Failed to update status page config" });
  }
};

module.exports = exports;
