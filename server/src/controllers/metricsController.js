// controllers/metricsController.js
const Metric = require("../models/Metric");

exports.addMetric = async (req, res) => {
  const metric = await Metric.create(req.body);
  res.json(metric);
};

exports.getServers = async (req, res) => {
  const servers = await Metric.distinct("serverId");
  res.json(servers);
};

exports.getMetrics = async (req, res) => {
  const data = await Metric.find({ serverId: req.params.id })
    .sort({ timestamp: -1 })
    .limit(50);

  res.json(data.reverse());
};