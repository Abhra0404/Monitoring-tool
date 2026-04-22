// ── Alert evaluation engine ──
// Evaluates alert rules against incoming metrics, tracks breach duration,
// and fires/resolves alerts.
//
// Horizontal-scale story: `breachState` is an in-memory Map for O(1) reads
// on the hot metric-ingest path. When Redis is configured the state is
// *mirrored* to a Redis hash asynchronously so that a rolling restart or
// a failed-over replica picks up the countdown where it left off. Hydration
// happens once at boot via `hydrateBreachStateFromRedis()`. Reads never
// await Redis — correctness on the critical path stays synchronous.

import type { Store } from "../../store/index.js";
import type { AlertFiredEvent } from "../../shared/types.js";

type BreachEntry = { firstBreachAt: number; lastBreachValue: number };

const breachState = new Map<string, BreachEntry>();

// ── Optional Redis mirror ──────────────────────────────────────────────────
// The engine is used from synchronous call paths, so we can't await Redis
// per-update. Instead we fire-and-forget with error suppression. Missed
// writes are self-healing — the next breach tick will overwrite the hash.

const REDIS_KEY = "theoria:alerts:breach_state";

interface MirrorTarget {
  hset(key: string, field: string, value: string): Promise<number>;
  hdel(key: string, field: string): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
}

let mirror: MirrorTarget | null = null;

export function attachBreachStateMirror(m: MirrorTarget | null): void {
  mirror = m;
}

/**
 * Load any previously-persisted breach state from Redis. Call once after
 * the Redis plugin is ready, before metric ingest begins.
 */
export async function hydrateBreachStateFromRedis(m: MirrorTarget): Promise<number> {
  const raw = await m.hgetall(REDIS_KEY);
  let loaded = 0;
  for (const [ruleId, json] of Object.entries(raw)) {
    try {
      const parsed = JSON.parse(json) as BreachEntry;
      if (
        typeof parsed.firstBreachAt === "number" &&
        typeof parsed.lastBreachValue === "number"
      ) {
        breachState.set(ruleId, parsed);
        loaded++;
      }
    } catch {
      // Corrupt entry — ignore.
    }
  }
  attachBreachStateMirror(m);
  return loaded;
}

function mirrorSet(key: string, entry: BreachEntry): void {
  if (!mirror) return;
  mirror.hset(REDIS_KEY, key, JSON.stringify(entry)).catch(() => {});
}

function mirrorDel(key: string): void {
  if (!mirror) return;
  mirror.hdel(REDIS_KEY, key).catch(() => {});
}

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
        const entry: BreachEntry = { firstBreachAt: now, lastBreachValue: value };
        breachState.set(stateKey, entry);
        mirrorSet(stateKey, entry);
        if (!rule.durationMinutes || rule.durationMinutes <= 0) {
          const alert = fireAlert(store, rule, userId, value);
          if (alert) firedAlerts.push(alert);
        }
      } else {
        state.lastBreachValue = value;
        mirrorSet(stateKey, state);
        const elapsedMin = (now - state.firstBreachAt) / 60_000;
        if (elapsedMin >= (rule.durationMinutes || 0)) {
          const alert = fireAlert(store, rule, userId, value);
          if (alert) firedAlerts.push(alert);
        }
      }
    } else {
      if (breachState.has(stateKey)) {
        breachState.delete(stateKey);
        mirrorDel(stateKey);
        resolveAlert(store, rule, userId, emitResolve);
      }
    }
  }

  return firedAlerts;
}

export function clearBreachState(ruleId: string): void {
  breachState.delete(ruleId);
  mirrorDel(ruleId);
}

/** Exposed for tests so each run starts with a clean map. */
export function __resetBreachStateForTests(): void {
  breachState.clear();
  mirror = null;
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
