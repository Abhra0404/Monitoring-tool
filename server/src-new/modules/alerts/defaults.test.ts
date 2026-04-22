import { describe, expect, it } from "vitest";
import store from "../../store/index.js";
import { seedDefaultAlerts } from "./defaults.js";

describe("seedDefaultAlerts", () => {
  it("creates 4 baseline rules for a new (user, server) pair", () => {
    const userId = "test-user-defaults-" + Date.now();
    const serverId = "host-" + Date.now();
    const before = store.AlertRules.find({ userId }).length;
    seedDefaultAlerts(store, userId, serverId);
    const after = store.AlertRules.find({ userId });
    expect(after.length - before).toBe(4);
    const names = after.map((r) => r.name);
    expect(names.some((n) => n.includes("CPU"))).toBe(true);
    expect(names.some((n) => n.includes("memory"))).toBe(true);
    expect(names.some((n) => n.includes("Disk"))).toBe(true);
    expect(names.some((n) => n.includes("unreachable"))).toBe(true);
    // Labels pin to host.
    for (const rule of after) {
      expect((rule.labels as Record<string, string>).host).toBe(serverId);
    }
  });

  it("is idempotent — calling twice does not create duplicates", () => {
    const userId = "test-user-defaults-dup-" + Date.now();
    const serverId = "host-" + Date.now();
    seedDefaultAlerts(store, userId, serverId);
    const first = store.AlertRules.find({ userId }).length;
    seedDefaultAlerts(store, userId, serverId);
    const second = store.AlertRules.find({ userId }).length;
    expect(second).toBe(first);
  });
});
