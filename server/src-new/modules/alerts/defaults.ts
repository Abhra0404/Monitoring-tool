/**
 * Default alerts seeding.
 *
 * When a server is observed for the first time (no server row existed
 * before its first metrics POST), we seed a baseline set of alert rules:
 *   - cpu_usage > 90 for 5m      (critical)
 *   - memory_usage_percent > 95 for 2m   (critical)
 *   - disk_usage_percent > 90            (warning)
 *   - server_unreachable == 1            (critical)
 *
 * Rules are upserted by name — repeat calls are idempotent, and existing
 * user-tuned rules with the same name are preserved (upsert merges updates,
 * but we only seed when the rule name is new).
 */

import type { Store } from "../../store/index.js";

const DEFAULT_RULES = [
  {
    name: "Default: High CPU usage",
    metricName: "cpu_usage",
    operator: ">",
    threshold: 90,
    durationMinutes: 5,
  },
  {
    name: "Default: High memory usage",
    metricName: "memory_usage_percent",
    operator: ">",
    threshold: 95,
    durationMinutes: 2,
  },
  {
    name: "Default: Disk usage",
    metricName: "disk_usage_percent",
    operator: ">",
    threshold: 90,
    durationMinutes: 0,
  },
  {
    name: "Default: Server unreachable",
    metricName: "server_unreachable",
    operator: "==",
    threshold: 1,
    durationMinutes: 0,
  },
] as const;

export function seedDefaultAlerts(store: Store, userId: string, serverId: string): void {
  for (const r of DEFAULT_RULES) {
    const name = `${r.name} — ${serverId}`;
    if (store.AlertRules.findOne(userId, name)) continue;
    store.AlertRules.upsert(userId, name, {
      metricName: r.metricName,
      operator: r.operator,
      threshold: r.threshold,
      durationMinutes: r.durationMinutes,
      labels: { host: serverId },
      isActive: true,
    });
  }
}
