const express = require("express");
const router = express.Router();
const serversController = require("../controllers/servers.controller");
const alertsController = require("../controllers/alerts.controller");
const { authenticate } = require("../middleware/auth.middleware");

// All routes are protected
router.use(authenticate);

// Server CRUD
router.get("/", serversController.getServers);
router.get("/:serverId", serversController.getServer);
router.get("/:serverId/metrics", serversController.getServerMetrics);
router.put("/:serverId", serversController.updateServer);
router.delete("/:serverId", serversController.deleteServer);

// Alert rules (per server)
router.get("/:serverId/alert-rules", alertsController.getAlertRules);
router.put("/:serverId/alert-rules", alertsController.upsertAlertRule);

module.exports = router;
