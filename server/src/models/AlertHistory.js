const mongoose = require("mongoose");

const alertHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AlertRule",
      required: true,
    },
    ruleName: {
      type: String,
      required: true,
    },
    metricName: {
      type: String,
      required: true,
    },
    labels: {
      type: Map,
      of: String,
      default: {},
    },
    operator: String,
    threshold: Number,
    actualValue: Number,
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "warning",
    },
    status: {
      type: String,
      enum: ["firing", "resolved"],
      default: "firing",
    },
    firedAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: Date,
    message: String,
  },
  { timestamps: true }
);

alertHistorySchema.index({ userId: 1, firedAt: -1 });
alertHistorySchema.index({ ruleId: 1, status: 1 });
// Auto-expire after 30 days
alertHistorySchema.index({ firedAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model("AlertHistory", alertHistorySchema);
