const jwt = require("jsonwebtoken");
const User = require("../models/User");

// JWT authentication middleware
exports.authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId).select("-password");

    if (!req.user) {
      return res.status(401).json({ error: "User not found" });
    }

    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

// API Key authentication middleware (for agents)
exports.authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers.authorization?.split(" ")[1];

    if (!apiKey) {
      return res.status(401).json({ error: "No API key provided" });
    }

    const user = await User.findOne({ apiKey });

    if (!user) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({ error: "Authentication error" });
  }
};
