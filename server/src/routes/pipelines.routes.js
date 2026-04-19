const express = require("express");
const router = express.Router();
const { authenticate, authenticateApiKey } = require("../middleware/auth.middleware");
const pipelinesController = require("../controllers/pipelines.controller");

// Webhook endpoint uses API key auth (same as /metrics)
router.post("/webhook", authenticateApiKey, pipelinesController.receiveWebhook);

// Dashboard endpoints use system user auth
router.use(authenticate);
router.get("/", pipelinesController.getPipelines);
router.get("/stats", pipelinesController.getPipelineStats);
router.delete("/:runId", pipelinesController.deletePipeline);

module.exports = router;
