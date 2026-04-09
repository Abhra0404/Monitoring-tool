const express = require("express");
const router = express.Router();
const alertsController = require("../controllers/alerts.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.use(authenticate);

// Alert rules CRUD
router.get("/rules", alertsController.getAllAlertRules);
router.post("/rules", alertsController.upsertAlertRule);
router.delete("/rules/:ruleId", alertsController.deleteAlertRule);
router.patch("/rules/:ruleId/toggle", alertsController.toggleAlertRule);

// Alert history
router.get("/history", alertsController.getAlertHistory);
router.get("/active-count", alertsController.getActiveAlertCount);

module.exports = router;
