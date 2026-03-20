const mongoose = require("mongoose");

const alertRuleSchema = new mongoose.Schema(
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
    cpuThreshold: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
      default: 80,
    },
    memoryThreshold: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
      default: 90,
    },
  },
  { timestamps: true }
);

alertRuleSchema.index({ userId: 1, serverId: 1 }, { unique: true });

module.exports = mongoose.model("AlertRule", alertRuleSchema);