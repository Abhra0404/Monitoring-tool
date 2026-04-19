// ── Metrics route module ──
// POST /metrics — receives agent metric payloads

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { evaluateAlerts } from "../alerts/engine.js";
import { dispatchAlert } from "../notifications/service.js";

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
      app.store.Servers.upsert(userId, serverId as string, {
        lastSeen: new Date().toISOString(),
        status: determineStatus(cpu as number, memoryPercent, diskPercent),
        ...(cpuCount !== undefined && { cpuCount: cpuCount as number }),
        ...(platform !== undefined && { platform: platform as string }),
        ...(arch !== undefined && { arch: arch as string }),
        ...(hostname !== undefined && { hostname: hostname as string }),
      });

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
      }

      // Evaluate alerts
      const firedAlerts = evaluateAlerts(
        app.store,
        userId,
        metricsMap,
        (alert) => {
          app.io.to("all").emit("alert:resolved", alert);
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
