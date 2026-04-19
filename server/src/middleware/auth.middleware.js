const { Users, systemUser } = require("../store");

// Internal single-user middleware for dashboard/API routes
exports.authenticate = async (req, res, next) => {
  try {
    const user = systemUser || Users.findByEmail("system@theoria.local");
    if (!user) {
      return res.status(500).json({ error: "System user not initialized" });
    }

    req.user = { ...user, password: undefined };
    next();
  } catch (error) {
    return res.status(500).json({ error: "Authentication error" });
  }
};

// API Key authentication middleware (for agents)
exports.authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers.authorization?.split(" ")[1];

    if (!apiKey) {
      return res.status(401).json({ error: "No API key provided" });
    }

    const user = Users.findByApiKey(apiKey);

    if (!user) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    req.user = { ...user, password: undefined };
    next();
  } catch (error) {
    return res.status(500).json({ error: "Authentication error" });
  }
};
