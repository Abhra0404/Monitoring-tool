// ── Server routes module ──
// GET /api/servers, GET /api/servers/:serverId, GET /api/servers/:serverId/metrics, etc.

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

function downsample(data: Record<string, number>[], targetPoints: number): Record<string, number>[] {
  if (data.length <= targetPoints) return data;
  const bucketSize = Math.ceil(data.length / targetPoints);
  const result: Record<string, number>[] = [];

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, i + bucketSize);
    const avg: Record<string, number> = {};
    const count = bucket.length;
    for (const point of bucket) {
      for (const [key, val] of Object.entries(point)) {
        if (typeof val === "number") {
          avg[key] = (avg[key] || 0) + val / count;
        }
      }
    }
    avg.timestamp = bucket[Math.floor(count / 2)].timestamp;
    result.push(avg);
  }
  return result;
}

export default async function serversRoutes(app: FastifyInstance): Promise<void> {
  // All routes require auth
  app.addHook("preHandler", app.authenticate);

  // GET /api/servers
  app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const servers = app.store.Servers.find(req.user._id);
    const now = Date.now();
    for (const s of servers) {
      if (now - new Date(s.lastSeen).getTime() > 60_000 && s.status !== "offline") {
        app.store.Servers.update(req.user._id, s.serverId, { status: "offline" });
        s.status = "offline";
      }
    }
    return servers;
  });

  // GET /api/servers/:serverId
  app.get("/:serverId", async (req: FastifyRequest<{ Params: { serverId: string } }>, reply: FastifyReply) => {
    const server = app.store.Servers.findOne(req.user._id, req.params.serverId);
    if (!server) return reply.status(404).send({ error: "Server not found" });
    return server;
  });

  // GET /api/servers/:serverId/metrics
  app.get("/:serverId/metrics", async (req: FastifyRequest<{ Params: { serverId: string }; Querystring: { timeRange?: string } }>, reply: FastifyReply) => {
    const { serverId } = req.params;
    const { timeRange = "5m" } = req.query;
    const now = Date.now();
    let startTime: number;
    let maxPoints = 300;

    switch (timeRange) {
      case "5m": startTime = now - 5 * 60 * 1000; maxPoints = 150; break;
      case "15m": startTime = now - 15 * 60 * 1000; maxPoints = 180; break;
      case "1h": startTime = now - 60 * 60 * 1000; maxPoints = 240; break;
      case "6h": startTime = now - 6 * 60 * 60 * 1000; maxPoints = 360; break;
      case "24h": startTime = now - 24 * 60 * 60 * 1000; maxPoints = 480; break;
      case "7d": startTime = now - 7 * 24 * 60 * 60 * 1000; maxPoints = 500; break;
      default: startTime = now - 5 * 60 * 1000;
    }

    const rawMetrics = app.store.Metrics.find(req.user._id, serverId, startTime);

    // Group by timestamp
    const grouped: Record<number, Record<string, number>> = {};
    for (const m of rawMetrics) {
      if (!grouped[m.timestamp]) grouped[m.timestamp] = { timestamp: m.timestamp };
      grouped[m.timestamp][m.name] = m.value;
    }

    let metrics = Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
    if (metrics.length > maxPoints) {
      metrics = downsample(metrics, maxPoints);
    }

    return metrics.map((m) => ({
      timestamp: m.timestamp,
      cpu: m.cpu_usage,
      totalMem: m.memory_total_bytes,
      freeMem: m.memory_free_bytes,
      memoryPercent: m.memory_usage_percent,
      uptime: m.system_uptime_seconds,
      loadAvg1: m.load_avg_1m,
      loadAvg5: m.load_avg_5m,
      loadAvg15: m.load_avg_15m,
      diskTotal: m.disk_total_bytes,
      diskFree: m.disk_free_bytes,
      diskPercent: m.disk_usage_percent,
      networkRx: m.network_rx_bytes_per_sec,
      networkTx: m.network_tx_bytes_per_sec,
    }));
  });

  // PUT /api/servers/:serverId
  app.put("/:serverId", async (req: FastifyRequest<{ Params: { serverId: string }; Body: { name?: string } }>, reply: FastifyReply) => {
    const { name } = req.body;
    const server = app.store.Servers.update(req.user._id, req.params.serverId, { name: name || undefined } as Record<string, unknown>);
    if (!server) return reply.status(404).send({ error: "Server not found" });
    return server;
  });

  // DELETE /api/servers/:serverId
  app.delete("/:serverId", async (req: FastifyRequest<{ Params: { serverId: string } }>, reply: FastifyReply) => {
    const server = app.store.Servers.delete(req.user._id, req.params.serverId);
    if (!server) return reply.status(404).send({ error: "Server not found" });
    app.store.Metrics.deleteByHost(req.user._id, req.params.serverId);
    return { message: "Server deleted successfully" };
  });

  // GET /api/servers/:serverId/alert-rules
  app.get("/:serverId/alert-rules", async (req: FastifyRequest<{ Params: { serverId: string } }>) => {
    return app.store.AlertRules.find({ userId: req.user._id, "labels.host": req.params.serverId });
  });

  // PUT /api/servers/:serverId/alert-rules
  app.put("/:serverId/alert-rules", async (req: FastifyRequest<{ Params: { serverId: string }; Body: Record<string, unknown> }>) => {
    const { serverId } = req.params;
    let { name, metricName, labels, operator, threshold, durationMinutes, isActive } = req.body as Record<string, unknown>;
    if (!name || !metricName || !operator || threshold == null) {
      return { error: "Missing required fields" };
    }
    if (!labels || !(labels as Record<string, string>).host) {
      labels = { ...(labels as Record<string, string> || {}), host: serverId };
    }
    return app.store.AlertRules.upsert(req.user._id, name as string, {
      userId: req.user._id,
      name: name as string,
      metricName: metricName as string,
      labels: labels as Record<string, string>,
      operator: operator as string,
      threshold: Number(threshold),
      durationMinutes: Number(durationMinutes) || 0,
      isActive: isActive !== undefined ? isActive as boolean : true,
    });
  });
}
