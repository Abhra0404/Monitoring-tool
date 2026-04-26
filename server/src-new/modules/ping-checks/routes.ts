import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { schedulePingCheck, unschedulePingCheck } from "./runner.js";
import { assertAllowedHost, InvalidCheckTargetError } from "../../shared/check-targets.js";

const createSchema = {
  body: {
    type: "object" as const,
    required: ["name", "host"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      host: { type: "string", minLength: 1, maxLength: 253, pattern: "^[a-zA-Z0-9._-]+$" },
      interval: { type: "integer", minimum: 5_000 },
    },
  },
};

export default async function pingChecksRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req: FastifyRequest) => {
    const checks = app.store.PingChecks.find(req.user._id);
    return checks.map(({ results: _r, ...rest }) => rest);
  });

  app.get("/:checkId", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const check = app.store.PingChecks.findById(req.params.checkId);
    if (!check || check.userId !== req.user._id) return reply.status(404).send({ error: "Ping check not found" });
    return check;
  });

  app.post("/", { schema: createSchema }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { name: string; host: string; interval?: number };
    try {
      assertAllowedHost(body.host);
    } catch (err) {
      const msg = err instanceof InvalidCheckTargetError ? err.message : "Invalid host";
      return reply.status(400).send({ error: msg });
    }
    const check = app.store.PingChecks.create({
      userId: req.user._id,
      name: body.name.trim(),
      host: body.host.trim(),
      interval: body.interval ?? 60_000,
    });
    schedulePingCheck(check);
    return reply.status(201).send(check);
  });

  app.delete("/:checkId", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const removed = app.store.PingChecks.delete(req.params.checkId, req.user._id);
    if (!removed) return reply.status(404).send({ error: "Ping check not found" });
    unschedulePingCheck(req.params.checkId);
    return { success: true };
  });

  app.patch("/:checkId/toggle", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const check = app.store.PingChecks.toggleActive(req.params.checkId, req.user._id);
    if (!check) return reply.status(404).send({ error: "Ping check not found" });
    if (check.isActive) schedulePingCheck(check);
    else unschedulePingCheck(check._id);
    return check;
  });
}
