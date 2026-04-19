const { DockerContainers } = require("../store");

exports.getContainers = async (req, res) => {
  try {
    const containers = DockerContainers.findAll(req.user._id);
    res.json(containers);
  } catch (error) {
    console.error("Error fetching Docker containers:", error);
    res.status(500).json({ error: "Failed to fetch Docker containers" });
  }
};

exports.getServerContainers = async (req, res) => {
  try {
    const containers = DockerContainers.find(req.user._id, req.params.serverId);
    res.json(containers);
  } catch (error) {
    console.error("Error fetching server Docker containers:", error);
    res.status(500).json({ error: "Failed to fetch Docker containers" });
  }
};

module.exports = exports;
