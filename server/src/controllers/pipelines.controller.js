const { Pipelines } = require("../store");
const { normalize } = require("../services/pipelineNormalizer");
const { dispatchPipelineFailure } = require("../services/notifier");

exports.receiveWebhook = async (req, res) => {
  try {
    const normalized = normalize(req.headers, req.body);
    if (!normalized) {
      return res.status(400).json({ error: "Unrecognized webhook format" });
    }

    const pipeline = Pipelines.upsert(req.user._id, normalized.source, normalized.runId, normalized);

    // Emit real-time update
    if (global.io) {
      global.io.to("all").emit("pipeline:update", pipeline);
    }

    // Notify on failure
    if (pipeline.status === "failure") {
      dispatchPipelineFailure(req.user._id, pipeline).catch((err) =>
        console.error("Pipeline notification error:", err.message)
      );
    }

    res.json({ success: true, id: pipeline._id });
  } catch (error) {
    console.error("Error processing pipeline webhook:", error);
    res.status(500).json({ error: "Failed to process webhook" });
  }
};

exports.getPipelines = async (req, res) => {
  try {
    const { source, status, branch, repo, limit } = req.query;
    const filter = {};
    if (source) filter.source = source;
    if (status) filter.status = status;
    if (branch) filter.branch = branch;
    if (repo) filter.repo = repo;
    if (limit) filter.limit = Number(limit);
    const pipelines = Pipelines.find(req.user._id, filter);
    res.json(pipelines);
  } catch (error) {
    console.error("Error fetching pipelines:", error);
    res.status(500).json({ error: "Failed to fetch pipelines" });
  }
};

exports.getPipelineStats = async (req, res) => {
  try {
    const stats = Pipelines.getStats(req.user._id);
    res.json(stats);
  } catch (error) {
    console.error("Error fetching pipeline stats:", error);
    res.status(500).json({ error: "Failed to fetch pipeline stats" });
  }
};

exports.deletePipeline = async (req, res) => {
  try {
    const removed = Pipelines.delete(req.params.runId, req.user._id);
    if (!removed) {
      return res.status(404).json({ error: "Pipeline run not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting pipeline:", error);
    res.status(500).json({ error: "Failed to delete pipeline" });
  }
};

module.exports = exports;
