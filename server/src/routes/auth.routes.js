const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth.middleware");

// Public routes
router.post("/signup", authController.signup);
router.post("/login", authController.login);

// Protected routes
router.get("/me", authenticate, authController.getMe);
router.post("/regenerate-key", authenticate, authController.regenerateApiKey);

module.exports = router;
