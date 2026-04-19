const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const statusPageController = require("../controllers/statusPage.controller");

// Public endpoint — no auth
router.get("/public", statusPageController.getPublicStatus);

// Admin endpoints — auth required
router.get("/config", authenticate, statusPageController.getStatusConfig);
router.put("/config", authenticate, statusPageController.updateStatusConfig);

module.exports = router;
