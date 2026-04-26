// ── HTTP Checks routes module ──

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { scheduleCheck, unscheduleCheck } from "./runner.js";
import { assertAllowedHttpUrl, InvalidCheckTargetError } from "../../shared/check-targets.js";

export default async function httpChecksRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  // GET /api/http-checks
  app.get("/", async (req: FastifyRequest) => {
    const checks = app.store.HttpChecks.find(req.user._id);
    return checks.map(({ results, ...rest }) => rest);
  });

  // GET /api/http-checks/:checkId
  app.get("/:checkId", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const check = app.store.HttpChecks.findById(req.params.checkId);
    if (!check || check.userId !== req.user._id) {
      return reply.status(404).send({ error: "HTTP check not found" });
    }
    return check;
  });

  // POST /api/http-checks
  app.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const { name, url, interval, expectedStatus } = req.body as Record<string, unknown>;
    if (!name || !url) {
      return reply.status(400).send({ error: "name and url are required" });
    }
    try {
      assertAllowedHttpUrl(url as string);
    } catch (err) {
      const msg = err instanceof InvalidCheckTargetError ? err.message : "Invalid URL";
      return reply.status(400).send({ error: msg });
    }
    const check = app.store.HttpChecks.create({
      userId: req.user._id,
      name: (name as string).trim(),
      url: (url as string).trim(),
      interval: Number(interval) || 60_000,
      expectedStatus: Number(expectedStatus) || 200,
    });
    scheduleCheck(check);
    return reply.status(201).send(check);
  });

  // DELETE /api/http-checks/:checkId
  app.delete("/:checkId", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const removed = app.store.HttpChecks.delete(req.params.checkId, req.user._id);
    if (!removed) return reply.status(404).send({ error: "HTTP check not found" });
    unscheduleCheck(req.params.checkId);
    return { success: true };
  });

  // PATCH /api/http-checks/:checkId/toggle
  app.patch("/:checkId/toggle", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const check = app.store.HttpChecks.toggleActive(req.params.checkId, req.user._id);
    if (!check) return reply.status(404).send({ error: "HTTP check not found" });
    if (check.isActive) scheduleCheck(check);
    else unscheduleCheck(check._id);
    return check;
  });
}
