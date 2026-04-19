// ── Alert evaluation engine ──
// Evaluates alert rules against incoming metrics, tracks breach duration,
// and fires/resolves alerts.

import type { Store } from "../../store/index.js";
import type { AlertFiredEvent } from "../../shared/types.js";

const breachState = new Map<string, { firstBreachAt: number; lastBreachValue: number }>();

type MetricsMap = Record<string, { value: number; labels: Record<string, string> }>;

export function evaluateAlerts(
  store: Store,
  userId: string,
  metricsMap: MetricsMap,
  emitResolve?: (alert: Record<string, unknown>) => void,
): AlertFiredEvent[] {
  const rules = store.AlertRules.find({ userId, isActive: true });
  if (rules.length === 0) return [];

  const firedAlerts: AlertFiredEvent[] = [];

  for (const rule of rules) {
    const metricEntry = metricsMap[rule.metricName];
    if (!metricEntry) continue;

    // Check label match
    if (rule.labels && Object.keys(rule.labels).length > 0) {
      const ruleLabels = rule.labels;
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
          const alert = fireAlert(store, rule, userId, value);
          if (alert) firedAlerts.push(alert);
        }
      } else {
        state.lastBreachValue = value;
        const elapsedMin = (now - state.firstBreachAt) / 60_000;
        if (elapsedMin >= (rule.durationMinutes || 0)) {
          const alert = fireAlert(store, rule, userId, value);
          if (alert) firedAlerts.push(alert);
        }
      }
    } else {
      if (breachState.has(stateKey)) {
        breachState.delete(stateKey);
        resolveAlert(store, rule, userId, emitResolve);
      }
    }
  }

  return firedAlerts;
}

export function clearBreachState(ruleId: string): void {
  breachState.delete(ruleId);
}

export function evaluateCondition(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case ">": return value > threshold;
    case "<": return value < threshold;
    case ">=": return value >= threshold;
    case "<=": return value <= threshold;
    case "==": return value === threshold;
    default: return false;
  }
}

function fireAlert(
  store: Store,
  rule: { _id: string; name: string; metricName: string; labels: Record<string, string>; operator: string; threshold: number },
  userId: string,
  actualValue: number,
): AlertFiredEvent | null {
  // Deduplicate — don't fire if already firing
  const existing = store.AlertHistory.findFiring(rule._id);
  if (existing) return null;

  const severity = determineSeverity(rule.threshold, actualValue);
  const labels = rule.labels || {};
  const host = labels.host || "unknown";

  const alert = store.AlertHistory.create({
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
    message: `${rule.name}: ${formatMetricName(rule.metricName)} is ${Number.isFinite(actualValue) ? actualValue.toFixed(1) : String(actualValue)} (threshold: ${rule.operator} ${rule.threshold}) on ${host}`,
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

function resolveAlert(
  store: Store,
  rule: { _id: string; name: string },
  userId: string,
  emitResolve?: (alert: Record<string, unknown>) => void,
): void {
  const alert = store.AlertHistory.resolve(rule._id, userId);
  if (alert && emitResolve) {
    emitResolve({
      id: alert._id,
      ruleName: alert.ruleName,
      message: `Resolved: ${alert.ruleName}`,
    });
  }
}

function determineSeverity(threshold: number, actualValue: number): "info" | "warning" | "critical" {
  const ratio = Math.abs(actualValue / (threshold || 1));
  if (ratio > 1.5) return "critical";
  if (ratio > 1.1) return "warning";
  return "info";
}

function formatMetricName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
