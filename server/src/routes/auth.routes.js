const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth.middleware");

// System routes
router.get("/me", authenticate, authController.getMe);
router.post("/regenerate-key", authenticate, authController.regenerateApiKey);

module.exports = router;
