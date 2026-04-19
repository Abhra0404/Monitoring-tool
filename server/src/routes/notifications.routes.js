const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const notificationsController = require("../controllers/notifications.controller");

router.use(authenticate);

router.get("/channels", notificationsController.getChannels);
router.post("/channels", notificationsController.createChannel);
router.put("/channels/:channelId", notificationsController.updateChannel);
router.delete("/channels/:channelId", notificationsController.deleteChannel);
router.patch("/channels/:channelId/toggle", notificationsController.toggleChannel);
router.post("/channels/:channelId/test", notificationsController.testChannel);

module.exports = router;
