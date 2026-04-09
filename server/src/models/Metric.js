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
    name: { 
      type: String, 
      required: true,
      index: true,
    }, // E.g. "cpu_usage", "memory_available_bytes"
    labels: {
      type: Map,
      of: String,
      default: {},
    }, // Multi-dimensional key-value pairs e.g. { "host": "server-1", "env": "prod" }
    value: { 
      type: Number, 
      required: true 
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
  },
  {
    timestamps: true,
    timeseries: {
      timeField: 'timestamp',
      metaField: 'labels',
      granularity: 'seconds',
    },
    expireAfterSeconds: 604800, // Auto-delete metrics older than 7 days
  }
);

// Compound index for efficient querying by user, name, and time
metricSchema.index({ userId: 1, name: 1, timestamp: -1 });

module.exports = mongoose.model("Metric", metricSchema);