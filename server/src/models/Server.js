const mongoose = require("mongoose");

const serverSchema = new mongoose.Schema(
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
    },
    name: {
      type: String,
      default: function () {
        return this.serverId;
      },
    },
    status: {
      type: String,
      enum: ["online", "warning", "offline"],
      default: "offline",
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Compound index for userId + serverId uniqueness
serverSchema.index({ userId: 1, serverId: 1 }, { unique: true });

module.exports = mongoose.model("Server", serverSchema);
