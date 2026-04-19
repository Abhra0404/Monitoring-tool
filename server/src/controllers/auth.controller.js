const { Users } = require("../store");

// Get current user
exports.getMe = async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        email: req.user.email,
        apiKey: req.user.apiKey,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get user" });
  }
};

// Regenerate API key
exports.regenerateApiKey = async (req, res) => {
  try {
    const user = Users.updateApiKey(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      apiKey: user.apiKey,
      message: "API key regenerated successfully",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to regenerate API key" });
  }
};
