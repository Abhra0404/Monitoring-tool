const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const dockerController = require("../controllers/docker.controller");

router.use(authenticate);

router.get("/", dockerController.getContainers);
router.get("/:serverId", dockerController.getServerContainers);

module.exports = router;
