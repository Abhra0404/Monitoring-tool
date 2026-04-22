import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { scheduleDnsCheck, unscheduleDnsCheck } from "./runner.js";

const createSchema = {
  body: {
    type: "object" as const,
    required: ["name", "domain", "recordType"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      domain: { type: "string", minLength: 1, maxLength: 253 },
      recordType: { type: "string", enum: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA"] },
      expected: { type: "string", maxLength: 1024 },
      interval: { type: "integer", minimum: 30_000 },
    },
  },
};

export default async function dnsChecksRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req: FastifyRequest) => {
    const checks = app.store.DnsChecks.find(req.user._id);
    return checks.map(({ results: _r, ...rest }) => rest);
  });

  app.get("/:checkId", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const check = app.store.DnsChecks.findById(req.params.checkId);
    if (!check || check.userId !== req.user._id) return reply.status(404).send({ error: "DNS check not found" });
    return check;
  });

  app.post("/", { schema: createSchema }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      name: string; domain: string;
      recordType: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SOA";
      expected?: string; interval?: number;
    };
    const check = app.store.DnsChecks.create({
      userId: req.user._id,
      name: body.name.trim(),
      domain: body.domain.trim(),
      recordType: body.recordType,
      expected: (body.expected ?? "").trim(),
      interval: body.interval ?? 300_000,
    });
    scheduleDnsCheck(check);
    return reply.status(201).send(check);
  });

  app.delete("/:checkId", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const removed = app.store.DnsChecks.delete(req.params.checkId, req.user._id);
    if (!removed) return reply.status(404).send({ error: "DNS check not found" });
    unscheduleDnsCheck(req.params.checkId);
    return { success: true };
  });

  app.patch("/:checkId/toggle", async (req: FastifyRequest<{ Params: { checkId: string } }>, reply: FastifyReply) => {
    const check = app.store.DnsChecks.toggleActive(req.params.checkId, req.user._id);
    if (!check) return reply.status(404).send({ error: "DNS check not found" });
    if (check.isActive) scheduleDnsCheck(check);
    else unscheduleDnsCheck(check._id);
    return check;
  });
}
