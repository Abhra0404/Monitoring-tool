import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { scheduleTcpCheck, unscheduleTcpCheck } from "./runner.js";

const createSchema = {
  body: {
    type: "object" as const,
    required: ["name", "host", "port"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      host: { type: "string", minLength: 1, maxLength: 255 },
      port: { type: "integer", minimum: 1, maximum: 65535 },
      interval: { type: "integer", minimum: 5_000 },
      timeoutMs: { type: "integer", minimum: 500, maximum: 60_000 },
    },
  },
};

export default async function tcpChecksRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req: FastifyRequest) => {
    const checks = app.store.TcpChecks.find(req.user._id);
    return checks.map(({ results: _r, ...rest }) => rest);
  });

  app.get("/:checkId", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const check = app.store.TcpChecks.findById(req.params.checkId);
    if (!check || check.userId !== req.user._id) {
      return reply.status(404).send({ error: "TCP check not found" });
    }
    return check;
  });

  app.post("/", { schema: createSchema }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { name: string; host: string; port: number; interval?: number; timeoutMs?: number };
    const check = app.store.TcpChecks.create({
      userId: req.user._id,
      name: body.name.trim(),
      host: body.host.trim(),
      port: body.port,
      interval: body.interval ?? 60_000,
      timeoutMs: body.timeoutMs ?? 5_000,
    });
    scheduleTcpCheck(check);
    return reply.status(201).send(check);
  });

  app.delete("/:checkId", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const removed = app.store.TcpChecks.delete(req.params.checkId, req.user._id);
    if (!removed) return reply.status(404).send({ error: "TCP check not found" });
    unscheduleTcpCheck(req.params.checkId);
    return { success: true };
  });

  app.patch("/:checkId/toggle", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const check = app.store.TcpChecks.toggleActive(req.params.checkId, req.user._id);
    if (!check) return reply.status(404).send({ error: "TCP check not found" });
    if (check.isActive) scheduleTcpCheck(check);
    else unscheduleTcpCheck(check._id);
    return check;
  });
}
