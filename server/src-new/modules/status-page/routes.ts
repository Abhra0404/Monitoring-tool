// ── Status Page routes module ──

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SYSTEM_USER_ID } from "../../store/index.js";

export default async function statusPageRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/status-page/public — no auth required
  app.get("/public", async (req: FastifyRequest, reply: FastifyReply) => {
    const config = app.store.StatusPageConfig.get(SYSTEM_USER_ID);
    if (!config || !config.isPublic) {
      return reply.status(404).send({ error: "Status page is not enabled" });
    }

    const servers = app.store.Servers.find(SYSTEM_USER_ID);
    const httpChecks = app.store.HttpChecks.find(SYSTEM_USER_ID).map(
      ({ results, ...rest }) => rest,
    );

    // Compute overall status
    const serverStatuses = servers.map((s) => s.status);
    const checkStatuses = (httpChecks as Array<Record<string, unknown>>)
      .filter((c) => c.isActive)
      .map((c) => c.status as string);
    const allStatuses = [...serverStatuses, ...checkStatuses];

    let overall = "operational";
    const hasDown = allStatuses.includes("offline") || allStatuses.includes("down");
    const hasWarning = allStatuses.includes("warning");
    if (hasDown) {
      overall = allStatuses.filter((s) => s === "offline" || s === "down").length > allStatuses.length / 2
        ? "major_outage"
        : "partial_outage";
    } else if (hasWarning) {
      overall = "degraded";
    }

    return {
      title: config.title || "System Status",
      description: config.description || "",
      overall,
      servers: servers.map((s) => ({
        name: s.name || s.serverId,
        status: s.status,
        lastSeen: s.lastSeen,
      })),
      httpChecks: (httpChecks as Array<Record<string, unknown>>)
        .filter((c) => c.isActive)
        .map((c) => ({
          name: c.name,
          url: c.url,
          status: c.status,
          uptimePercent: c.uptimePercent,
          lastCheckedAt: c.lastCheckedAt,
        })),
      customServices: config.customServices || [],
      updatedAt: new Date().toISOString(),
    };
  });

  // GET /api/status-page/config — auth required
  app.get("/config", { preHandler: [app.authenticate] }, async (req: FastifyRequest) => {
    return app.store.StatusPageConfig.get(req.user._id) || {
      title: "System Status",
      description: "",
      isPublic: false,
      customServices: [],
    };
  });

  // PUT /api/status-page/config — auth required
  app.put("/config", { preHandler: [app.authenticate] }, async (req: FastifyRequest) => {
    const { title, description, isPublic, customServices } = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (isPublic !== undefined) updates.isPublic = isPublic;
    if (customServices !== undefined) updates.customServices = customServices;
    return app.store.StatusPageConfig.upsert(req.user._id, updates);
  });
}
