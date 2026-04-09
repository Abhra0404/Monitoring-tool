const AlertRule = require("../models/AlertRule");
const AlertHistory = require("../models/AlertHistory");

// In-memory state for duration-based alerting
// Key: `${ruleId}` → { firstBreachAt: Date, lastBreachValue: Number }
const breachState = new Map();

/**
 * Evaluate all active alert rules for a user against incoming metrics.
 * Called every time the agent pushes metrics.
 *
 * @param {string} userId
 * @param {Object} metricsMap  – { metricName: { value, labels } }
 * @returns {Array} fired alerts to broadcast
 */
async function evaluateAlerts(userId, metricsMap) {
  const rules = await AlertRule.find({ userId, isActive: true }).lean();
  if (rules.length === 0) return [];

  const firedAlerts = [];

  for (const rule of rules) {
    const metricEntry = metricsMap[rule.metricName];
    if (!metricEntry) continue;

    // Check label match
    if (rule.labels && rule.labels.size > 0) {
      const ruleLabels = rule.labels instanceof Map ? Object.fromEntries(rule.labels) : rule.labels;
      const metricLabels = metricEntry.labels || {};
      let match = true;
      for (const [k, v] of Object.entries(ruleLabels)) {
        if (metricLabels[k] !== v) {
          match = false;
          break;
        }
      }
      if (!match) continue;
    }

    const value = metricEntry.value;
    const breached = evaluateCondition(value, rule.operator, rule.threshold);
    const stateKey = rule._id.toString();

    if (breached) {
      const now = Date.now();
      const state = breachState.get(stateKey);

      if (!state) {
        breachState.set(stateKey, { firstBreachAt: now, lastBreachValue: value });
        // If durationMinutes is 0 or not set, fire immediately
        if (!rule.durationMinutes || rule.durationMinutes <= 0) {
          const alert = await fireAlert(rule, userId, value);
          if (alert) firedAlerts.push(alert);
        }
      } else {
        state.lastBreachValue = value;
        const elapsedMin = (now - state.firstBreachAt) / 60000;
        if (elapsedMin >= (rule.durationMinutes || 0)) {
          const alert = await fireAlert(rule, userId, value);
          if (alert) firedAlerts.push(alert);
          // Reset so we don't spam — leave state, resolveAlert will clean up
        }
      }
    } else {
      // Condition no longer breached — resolve any open alerts
      if (breachState.has(stateKey)) {
        breachState.delete(stateKey);
        await resolveAlert(rule, userId);
      }
    }
  }

  return firedAlerts;
}

function evaluateCondition(value, operator, threshold) {
  switch (operator) {
    case ">": return value > threshold;
    case "<": return value < threshold;
    case ">=": return value >= threshold;
    case "<=": return value <= threshold;
    case "==": return value === threshold;
    default: return false;
  }
}

async function fireAlert(rule, userId, actualValue) {
  // Deduplicate — don't fire if already firing for this rule
  const existing = await AlertHistory.findOne({
    ruleId: rule._id,
    status: "firing",
  });
  if (existing) return null;

  const severity = determineSeverity(rule, actualValue);
  const labels = rule.labels instanceof Map ? Object.fromEntries(rule.labels) : (rule.labels || {});
  const host = labels.host || "unknown";

  const alert = await AlertHistory.create({
    userId,
    ruleId: rule._id,
    ruleName: rule.name,
    metricName: rule.metricName,
    labels: rule.labels,
    operator: rule.operator,
    threshold: rule.threshold,
    actualValue,
    severity,
    status: "firing",
    message: `${rule.name}: ${formatMetricName(rule.metricName)} is ${actualValue.toFixed(1)} (threshold: ${rule.operator} ${rule.threshold}) on ${host}`,
  });

  return {
    id: alert._id,
    ruleName: alert.ruleName,
    metricName: alert.metricName,
    severity: alert.severity,
    message: alert.message,
    actualValue,
    threshold: rule.threshold,
    firedAt: alert.firedAt,
    labels,
  };
}

async function resolveAlert(rule, userId) {
  const alert = await AlertHistory.findOneAndUpdate(
    { ruleId: rule._id, userId, status: "firing" },
    { status: "resolved", resolvedAt: new Date() },
    { new: true }
  );
  if (alert && global.io) {
    global.io.to(`user:${userId}`).emit("alert:resolved", {
      id: alert._id,
      ruleName: alert.ruleName,
      message: `Resolved: ${alert.ruleName}`,
    });
  }
}

function determineSeverity(rule, actualValue) {
  const ratio = Math.abs(actualValue / (rule.threshold || 1));
  if (ratio > 1.5) return "critical";
  if (ratio > 1.1) return "warning";
  return "info";
}

function formatMetricName(name) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = { evaluateAlerts };
