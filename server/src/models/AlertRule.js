const mongoose = require("mongoose");

const alertRuleSchema = new mongoose.Schema(
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
    }, // E.g., "High CPU Usage"
    metricName: {
      type: String,
      required: true,
    }, // The exact metric to watch, e.g., "cpu_usage"
    labels: {
      type: Map,
      of: String,
      default: {},
    }, // Filter which metrics apply, e.g., { host: "server-1" }
    operator: {
      type: String,
      enum: [">", "<", ">=", "<=", "=="],
      required: true,
    },
    threshold: {
      type: Number,
      required: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      default: 5,
    }, // Duration for stateful alerting 
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

alertRuleSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("AlertRule", alertRuleSchema);