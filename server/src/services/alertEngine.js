const { AlertRules, AlertHistory } = require("../store");
const { dispatchAlert } = require("./notifier");

// In-memory state for duration-based alerting
const breachState = new Map();

async function evaluateAlerts(userId, metricsMap) {
  const rules = AlertRules.find({ userId, isActive: true });
  if (rules.length === 0) return [];

  const firedAlerts = [];

  for (const rule of rules) {
    const metricEntry = metricsMap[rule.metricName];
    if (!metricEntry) continue;

    // Check label match
    if (rule.labels && Object.keys(rule.labels).length > 0) {
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
    const stateKey = rule._id;

    if (breached) {
      const now = Date.now();
      const state = breachState.get(stateKey);

      if (!state) {
        breachState.set(stateKey, { firstBreachAt: now, lastBreachValue: value });
        if (!rule.durationMinutes || rule.durationMinutes <= 0) {
          const alert = fireAlert(rule, userId, value);
          if (alert) firedAlerts.push(alert);
        }
      } else {
        state.lastBreachValue = value;
        const elapsedMin = (now - state.firstBreachAt) / 60000;
        if (elapsedMin >= (rule.durationMinutes || 0)) {
          const alert = fireAlert(rule, userId, value);
          if (alert) firedAlerts.push(alert);
        }
      }
    } else {
      if (breachState.has(stateKey)) {
        breachState.delete(stateKey);
        resolveAlert(rule, userId);
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

function fireAlert(rule, userId, actualValue) {
  // Deduplicate
  const existing = AlertHistory.findFiring(rule._id);
  if (existing) return null;

  const severity = determineSeverity(rule, actualValue);
  const labels = rule.labels instanceof Map ? Object.fromEntries(rule.labels) : (rule.labels || {});
  const host = labels.host || "unknown";
  const actualNum = Number(actualValue);
  const displayValue = Number.isFinite(actualNum) ? actualNum.toFixed(1) : String(actualValue);

  const alert = AlertHistory.create({
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
    message: `${rule.name}: ${formatMetricName(rule.metricName)} is ${displayValue} (threshold: ${rule.operator} ${rule.threshold}) on ${host}`,
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

function resolveAlert(rule, userId) {
  const alert = AlertHistory.resolve(rule._id, userId);
  if (alert) {
    if (global.io) {
      global.io.to("all").emit("alert:resolved", {
        id: alert._id,
        ruleName: alert.ruleName,
        message: `Resolved: ${alert.ruleName}`,
      });
    }
    dispatchAlert(userId, {
      ...alert,
      message: `Resolved: ${alert.ruleName}`,
    }, "resolved").catch((err) =>
      console.error("Resolve notification error:", err.message)
    );
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
