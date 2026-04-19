const express = require("express");
const router = express.Router();
const httpChecksController = require("../controllers/httpChecks.controller");
const { authenticate } = require("../middleware/auth.middleware");

router.use(authenticate);

router.get("/", httpChecksController.getChecks);
router.get("/:checkId", httpChecksController.getCheck);
router.post("/", httpChecksController.createCheck);
router.delete("/:checkId", httpChecksController.deleteCheck);
router.patch("/:checkId/toggle", httpChecksController.toggleCheck);

module.exports = router;
