// ── Metrics route module ──
// POST /metrics — receives agent metric payloads

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { evaluateAlerts } from "../alerts/engine.js";
import { seedDefaultAlerts } from "../alerts/defaults.js";
import { dispatchAlert } from "../notifications/service.js";
import { emitEvent } from "../events/service.js";
import { observe as observeAnomaly } from "../anomaly/detector.js";

const receiveMetricsSchema = {
  body: {
    type: "object" as const,
    required: ["serverId", "cpu", "totalMem", "freeMem"],
    properties: {
      serverId: { type: "string" },
      cpu: { type: "number" },
      totalMem: { type: "number" },
      freeMem: { type: "number" },
      uptime: { type: "number" },
      loadAvg1: { type: "number" },
      loadAvg5: { type: "number" },
      loadAvg15: { type: "number" },
      diskTotal: { type: "number" },
      diskFree: { type: "number" },
      networkRx: { type: "number" },
      networkTx: { type: "number" },
      cpuCount: { type: "integer" },
      platform: { type: "string" },
      arch: { type: "string" },
      hostname: { type: "string" },
      timestamp: { type: "number" },
      containers: { type: "array" },
    },
  },
};

function determineStatus(cpu: number, memoryPercent: number, diskPercent: number): "online" | "warning" | "critical" {
  if (cpu > 90 || memoryPercent > 95 || diskPercent > 95) return "critical";
  if (cpu > 70 || memoryPercent > 80 || diskPercent > 85) return "warning";
  return "online";
}

export default async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/metrics",
    {
      schema: receiveMetricsSchema,
      preHandler: [app.authenticateApiKey],
      config: { rateLimit: { max: 10, timeWindow: 1000 } },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as Record<string, unknown>;
      const {
        serverId, cpu, totalMem, freeMem, uptime,
        loadAvg1, loadAvg5, loadAvg15,
        diskTotal, diskFree,
        networkRx, networkTx,
        cpuCount, platform, arch, hostname,
        containers,
      } = body;

      const userId = req.user._id;

      const memoryPercent = totalMem ? (((totalMem as number) - (freeMem as number)) / (totalMem as number)) * 100 : 0;
      const diskPercent = diskTotal ? (((diskTotal as number) - ((diskFree as number) || 0)) / (diskTotal as number)) * 100 : 0;

      // Upsert server
      const existing = app.store.Servers.findOne(userId, serverId as string);
      const isNewServer = !existing;
      const prevStatus = existing?.status ?? null;
      const nextStatus = determineStatus(cpu as number, memoryPercent, diskPercent);
      app.store.Servers.upsert(userId, serverId as string, {
        lastSeen: new Date().toISOString(),
        status: nextStatus,
        ...(cpuCount !== undefined && { cpuCount: cpuCount as number }),
        ...(platform !== undefined && { platform: platform as string }),
        ...(arch !== undefined && { arch: arch as string }),
        ...(hostname !== undefined && { hostname: hostname as string }),
      });
      if (isNewServer) {
        seedDefaultAlerts(app.store, userId, serverId as string);
        emitEvent(app.store, app.io, {
          userId,
          kind: "server_online",
          source: "agent",
          severity: "info",
          title: `Agent connected: ${serverId as string}`,
          detail: { serverId, platform, arch, hostname, cpuCount },
        });
      } else if (prevStatus === "offline") {
        // nextStatus is never "offline" (determineStatus only returns the
        // live three states), so any transition from offline is a recovery.
        emitEvent(app.store, app.io, {
          userId,
          kind: "server_online",
          source: "agent",
          severity: "info",
          title: `Server recovered: ${serverId as string}`,
          detail: { serverId, previousStatus: prevStatus },
        });
      }

      const timestamp = new Date();
      const labels = { host: serverId as string };
      const metricsToSave: Array<{ userId: string; name: string; value: number; labels: Record<string, string>; timestamp: Date }> = [];
      const metricsMap: Record<string, { value: number; labels: Record<string, string> }> = {};

      function addMetric(name: string, value: unknown): void {
        if (value === undefined || value === null) return;
        metricsToSave.push({ userId, name, value: value as number, labels, timestamp });
        metricsMap[name] = { value: value as number, labels };
      }

      addMetric("cpu_usage", cpu);
      addMetric("memory_total_bytes", totalMem);
      addMetric("memory_free_bytes", freeMem);
      addMetric("memory_usage_percent", memoryPercent);
      addMetric("system_uptime_seconds", uptime);
      addMetric("load_avg_1m", loadAvg1);
      addMetric("load_avg_5m", loadAvg5);
      addMetric("load_avg_15m", loadAvg15);
      addMetric("disk_total_bytes", diskTotal);
      addMetric("disk_free_bytes", diskFree);
      addMetric("disk_usage_percent", diskPercent);
      addMetric("network_rx_bytes_per_sec", networkRx);
      addMetric("network_tx_bytes_per_sec", networkTx);

      if (metricsToSave.length > 0) {
        app.store.Metrics.insertMany(metricsToSave);
        app.metrics?.metricsIngested.inc({ source: "agent" }, metricsToSave.length);
      }

      // Anomaly detection on key resource metrics only — they are the most
      // actionable and have the lowest noise profile. Other metrics (network,
      // uptime) drift too wildly to yield meaningful Z-scores.
      const ANOMALY_METRICS: Array<[string, unknown]> = [
        ["cpu_usage", cpu],
        ["memory_usage_percent", memoryPercent],
        ["disk_usage_percent", diskPercent],
        ["load_avg_1m", loadAvg1],
      ];
      for (const [name, value] of ANOMALY_METRICS) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const result = observeAnomaly(userId, serverId as string, name, value, timestamp.getTime());
        if (result) {
          emitEvent(app.store, app.io, {
            userId,
            kind: "anomaly",
            source: "anomaly-detector",
            severity: Math.abs(result.zScore) >= 5 ? "critical" : "warning",
            title: `${name} anomaly on ${serverId as string}: ${value.toFixed(1)} (z=${result.zScore.toFixed(2)})`,
            detail: {
              serverId,
              metric: name,
              value,
              zScore: result.zScore,
              mean: result.mean,
              stddev: result.stddev,
              samples: result.samples,
            },
            time: timestamp.getTime(),
          });
          app.io.to("all").emit("anomaly", {
            serverId,
            metric: name,
            value,
            zScore: result.zScore,
            mean: result.mean,
            stddev: result.stddev,
            timestamp: timestamp.getTime(),
          });
        }
      }

      // Evaluate alerts
      const firedAlerts = evaluateAlerts(
        app.store,
        userId,
        metricsMap,
        (alert) => {
          app.io.to("all").emit("alert:resolved", alert);
          emitEvent(app.store, app.io, {
            userId,
            kind: "alert_resolved",
            source: "alerts",
            severity: "info",
            title: `Alert resolved: ${alert.ruleName as string}`,
            detail: alert,
          });
          dispatchAlert(app.store, userId, alert as unknown as Record<string, unknown>, "resolved").catch((err: unknown) =>
            console.error("Resolve notification error:", (err as Error).message),
          );
        },
      );

      // Emit via Socket.IO
      app.io.to("all").emit("metrics", {
        serverId,
        cpu,
        totalMem,
        freeMem,
        uptime,
        memoryPercent,
        loadAvg1,
        loadAvg5,
        loadAvg15,
        diskTotal,
        diskFree,
        diskPercent,
        networkRx,
        networkTx,
        time: timestamp.toLocaleTimeString(),
        timestamp: timestamp.getTime(),
      });

      for (const alert of firedAlerts) {
        app.io.to("all").emit("alert:fired", alert);
        emitEvent(app.store, app.io, {
          userId,
          kind: "alert_fired",
          source: "alerts",
          severity:
            alert.severity === "critical"
              ? "critical"
              : alert.severity === "warning"
                ? "warning"
                : "info",
          title: `Alert firing: ${alert.ruleName}`,
          detail: {
            ruleId: alert.id,
            ruleName: alert.ruleName,
            metricName: alert.metricName,
            actualValue: alert.actualValue,
            threshold: alert.threshold,
            labels: alert.labels,
          },
        });
        dispatchAlert(app.store, userId, alert as unknown as Record<string, unknown>, "fired").catch((err: unknown) =>
          console.error("Alert notification error:", (err as Error).message),
        );
      }

      // Docker containers
      if (containers && Array.isArray(containers)) {
        app.store.DockerContainers.upsertMany(userId, serverId as string, containers as Array<Record<string, unknown>>);
        app.io.to("all").emit("docker:metrics", { serverId, containers });
      }

      return reply.status(200).send({ ok: true });
    },
  );
}
