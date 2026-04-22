/**
 * Alert engine — end-to-end tests covering duration tracking, severity
 * determination, fire/resolve transitions, and label matching.
 *
 * These tests reset the breach-state map between cases by re-importing the
 * module with vite's dynamic import + a key suffix trick would be overkill;
 * instead each test uses a fresh rule id so state does not leak.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../../store/index.js";
import { evaluateAlerts, clearBreachState } from "./engine.js";

function makeStore(): Store {
  const rules: Array<Record<string, unknown>> = [];
  const history: Array<Record<string, unknown>> = [];
  let seq = 0;
  const mk = () => `id-${++seq}`;

  return {
    AlertRules: {
      find: (f: { userId?: string; isActive?: boolean } = {}) =>
        rules.filter(
          (r) =>
            (!f.userId || r.userId === f.userId) &&
            (f.isActive === undefined || r.isActive === f.isActive),
        ) as never,
      upsert: (_u: string, _n: string, input: Record<string, unknown>) => {
        const rule = { _id: mk(), ...input };
        rules.push(rule);
        return rule as never;
      },
    },
    AlertHistory: {
      findFiring: (ruleId: string) =>
        history.find((h) => h.ruleId === ruleId && h.status === "firing") as never,
      create: (input: Record<string, unknown>) => {
        const entry = {
          _id: mk(),
          firedAt: new Date().toISOString(),
          status: "firing",
          ...input,
        };
        history.push(entry);
        return entry as never;
      },
      resolve: (ruleId: string) => {
        const entry = history.find((h) => h.ruleId === ruleId && h.status === "firing");
        if (!entry) return null as never;
        entry.status = "resolved";
        entry.resolvedAt = new Date().toISOString();
        return entry as never;
      },
    },
  } as unknown as Store;
}

describe("evaluateAlerts — immediate firing (durationMinutes = 0)", () => {
  let store: Store;
  beforeEach(() => {
    store = makeStore();
  });

  it("fires as soon as a rule's threshold is breached", () => {
    const rule = store.AlertRules.upsert("u1", "High CPU", {
      userId: "u1",
      name: "High CPU",
      metricName: "cpu",
      labels: {},
      operator: ">",
      threshold: 80,
      durationMinutes: 0,
      isActive: true,
    });

    const fired = evaluateAlerts(store, "u1", {
      cpu: { value: 95, labels: { host: "h1" } },
    });

    expect(fired).toHaveLength(1);
    expect(fired[0].ruleName).toBe("High CPU");
    expect(fired[0].actualValue).toBe(95);
    clearBreachState(rule._id);
  });

  it("does not double-fire while already firing", () => {
    const rule = store.AlertRules.upsert("u1", "High CPU", {
      userId: "u1",
      name: "High CPU",
      metricName: "cpu",
      labels: {},
      operator: ">",
      threshold: 80,
      durationMinutes: 0,
      isActive: true,
    });
    evaluateAlerts(store, "u1", { cpu: { value: 95, labels: {} } });
    const second = evaluateAlerts(store, "u1", { cpu: { value: 96, labels: {} } });
    expect(second).toHaveLength(0);
    clearBreachState(rule._id);
  });

  it("resolves when the metric drops below threshold", () => {
    const rule = store.AlertRules.upsert("u1", "High CPU", {
      userId: "u1",
      name: "High CPU",
      metricName: "cpu",
      labels: {},
      operator: ">",
      threshold: 80,
      durationMinutes: 0,
      isActive: true,
    });
    evaluateAlerts(store, "u1", { cpu: { value: 95, labels: {} } });
    const resolveSpy = vi.fn();
    evaluateAlerts(store, "u1", { cpu: { value: 20, labels: {} } }, resolveSpy);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    clearBreachState(rule._id);
  });
});

describe("evaluateAlerts — duration tracking (durationMinutes > 0)", () => {
  let store: Store;
  beforeEach(() => {
    store = makeStore();
    vi.useFakeTimers();
  });

  it("does not fire until the breach persists for durationMinutes", () => {
    const rule = store.AlertRules.upsert("u1", "Slow CPU", {
      userId: "u1",
      name: "Slow CPU",
      metricName: "cpu",
      labels: {},
      operator: ">",
      threshold: 80,
      durationMinutes: 5,
      isActive: true,
    });

    const t0 = new Date("2026-01-01T00:00:00Z").getTime();
    vi.setSystemTime(t0);
    expect(evaluateAlerts(store, "u1", { cpu: { value: 95, labels: {} } })).toHaveLength(0);

    // 2 minutes elapsed — still under duration threshold.
    vi.setSystemTime(t0 + 2 * 60_000);
    expect(evaluateAlerts(store, "u1", { cpu: { value: 95, labels: {} } })).toHaveLength(0);

    // 5 minutes elapsed — must fire.
    vi.setSystemTime(t0 + 5 * 60_000);
    const fired = evaluateAlerts(store, "u1", { cpu: { value: 95, labels: {} } });
    expect(fired).toHaveLength(1);

    clearBreachState(rule._id);
    vi.useRealTimers();
  });

  it("resets the breach clock if the metric recovers", () => {
    const rule = store.AlertRules.upsert("u1", "Slow CPU", {
      userId: "u1",
      name: "Slow CPU",
      metricName: "cpu",
      labels: {},
      operator: ">",
      threshold: 80,
      durationMinutes: 3,
      isActive: true,
    });

    const t0 = new Date("2026-02-01T00:00:00Z").getTime();
    vi.setSystemTime(t0);
    evaluateAlerts(store, "u1", { cpu: { value: 95, labels: {} } });

    // Recovery clears state.
    vi.setSystemTime(t0 + 60_000);
    evaluateAlerts(store, "u1", { cpu: { value: 20, labels: {} } });

    // A new breach must start a fresh 3-minute clock.
    vi.setSystemTime(t0 + 2 * 60_000);
    expect(evaluateAlerts(store, "u1", { cpu: { value: 95, labels: {} } })).toHaveLength(0);
    vi.setSystemTime(t0 + 4 * 60_000);
    expect(evaluateAlerts(store, "u1", { cpu: { value: 95, labels: {} } })).toHaveLength(0);
    vi.setSystemTime(t0 + 5 * 60_000);
    const fired = evaluateAlerts(store, "u1", { cpu: { value: 95, labels: {} } });
    expect(fired).toHaveLength(1);

    clearBreachState(rule._id);
    vi.useRealTimers();
  });
});

describe("evaluateAlerts — severity classification", () => {
  it("classifies severity based on actual/threshold ratio", () => {
    const store = makeStore();
    store.AlertRules.upsert("u1", "CPU", {
      userId: "u1",
      name: "CPU",
      metricName: "cpu",
      labels: {},
      operator: ">",
      threshold: 50,
      durationMinutes: 0,
      isActive: true,
    });

    const fired = evaluateAlerts(store, "u1", { cpu: { value: 80, labels: {} } });
    expect(fired[0].severity).toBe("critical");

    // Reset and test warning band (ratio > 1.1).
    const store2 = makeStore();
    store2.AlertRules.upsert("u1", "CPU", {
      userId: "u1",
      name: "CPU",
      metricName: "cpu",
      labels: {},
      operator: ">",
      threshold: 50,
      durationMinutes: 0,
      isActive: true,
    });
    const warn = evaluateAlerts(store2, "u1", { cpu: { value: 56, labels: {} } });
    expect(warn[0].severity).toBe("warning");
  });
});

describe("evaluateAlerts — label matching", () => {
  it("only fires when every label in the rule matches the metric", () => {
    const store = makeStore();
    store.AlertRules.upsert("u1", "Host-specific", {
      userId: "u1",
      name: "Host-specific",
      metricName: "cpu",
      labels: { host: "web-1" },
      operator: ">",
      threshold: 50,
      durationMinutes: 0,
      isActive: true,
    });

    expect(
      evaluateAlerts(store, "u1", { cpu: { value: 99, labels: { host: "web-2" } } }),
    ).toHaveLength(0);
    expect(
      evaluateAlerts(store, "u1", { cpu: { value: 99, labels: { host: "web-1" } } }),
    ).toHaveLength(1);
  });
});
