const express = require("express");
const router = express.Router();
const serversController = require("../controllers/servers.controller");
const alertsController = require("../controllers/alerts.controller");
const { authenticate } = require("../middleware/auth.middleware");

// All routes are protected
router.use(authenticate);

router.get("/", serversController.getServers);
router.get("/:serverId", serversController.getServer);
router.get("/:serverId/metrics", serversController.getServerMetrics);
router.get("/:serverId/alert-rules", alertsController.getAlertRule);
router.put("/:serverId/alert-rules", alertsController.upsertAlertRule);
router.put("/:serverId", serversController.updateServer);
router.delete("/:serverId", serversController.deleteServer);

module.exports = router;
