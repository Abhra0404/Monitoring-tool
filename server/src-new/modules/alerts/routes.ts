// ── Alert routes module ──

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { clearBreachState } from "./engine.js";

export default async function alertsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  // GET /api/alerts/rules
  app.get("/rules", async (req: FastifyRequest) => {
    return app.store.AlertRules.find({ userId: req.user._id });
  });

  // POST /api/alerts/rules
  app.post("/rules", async (req: FastifyRequest, reply: FastifyReply) => {
    const { name, metricName, labels, operator, threshold, durationMinutes, isActive } = req.body as Record<string, unknown>;
    if (!name || !metricName || !operator || threshold == null) {
      return reply.status(400).send({ error: "Missing required fields: name, metricName, operator, threshold" });
    }
    const thresholdNum = Number(threshold);
    if (!Number.isFinite(thresholdNum)) {
      return reply.status(400).send({ error: "threshold must be a finite number" });
    }
    const durationNum = durationMinutes != null ? Number(durationMinutes) : 0;
    if (!Number.isFinite(durationNum) || durationNum < 0) {
      return reply.status(400).send({ error: "durationMinutes must be a non-negative number" });
    }
    return app.store.AlertRules.upsert(req.user._id, name as string, {
      userId: req.user._id,
      name: name as string,
      metricName: metricName as string,
      labels: (labels as Record<string, string>) || {},
      operator: operator as string,
      threshold: thresholdNum,
      durationMinutes: durationNum,
      isActive: isActive !== undefined ? isActive as boolean : true,
    });
  });

  // DELETE /api/alerts/rules/:ruleId
  app.delete("/rules/:ruleId", async (req: FastifyRequest<{ Params: { ruleId: string } }>, reply: FastifyReply) => {
    const rule = app.store.AlertRules.delete(req.params.ruleId, req.user._id);
    if (!rule) return reply.status(404).send({ error: "Alert rule not found" });
    app.store.AlertHistory.resolveByRuleId(rule._id);
    clearBreachState(rule._id);
    return { success: true };
  });

  // PATCH /api/alerts/rules/:ruleId/toggle
  app.patch("/rules/:ruleId/toggle", async (req: FastifyRequest<{ Params: { ruleId: string } }>, reply: FastifyReply) => {
    const rule = app.store.AlertRules.toggleActive(req.params.ruleId, req.user._id);
    if (!rule) return reply.status(404).send({ error: "Alert rule not found" });
    return rule;
  });

  // GET /api/alerts/history
  app.get("/history", async (req: FastifyRequest<{ Querystring: { status?: string; limit?: string } }>) => {
    const { status, limit = "50" } = req.query;
    const filter: Record<string, string> = { userId: req.user._id };
    if (status) filter.status = status;
    return app.store.AlertHistory.find(filter, Math.min(Number(limit), 200));
  });

  // GET /api/alerts/active-count
  app.get("/active-count", async (req: FastifyRequest) => {
    const count = app.store.AlertHistory.countFiring(req.user._id);
    return { count };
  });
}
