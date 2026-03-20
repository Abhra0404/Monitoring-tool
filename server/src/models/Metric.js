// models/Metric.js
const mongoose = require("mongoose");

const metricSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    serverId: {
      type: String,
      required: true,
      index: true,
    },
    cpu: Number,
    totalMem: Number,
    freeMem: Number,
    uptime: Number,
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Compound index for efficient queries
metricSchema.index({ userId: 1, serverId: 1, timestamp: -1 });

// TTL index - automatically delete metrics older than 7 days
metricSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model("Metric", metricSchema);