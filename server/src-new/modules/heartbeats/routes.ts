import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { recordPing } from "./runner.js";

const SLUG_PATTERN = "^[a-z0-9][a-z0-9-]{1,62}$";

const createSchema = {
  body: {
    type: "object" as const,
    required: ["name", "slug", "expectedEverySeconds"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      slug: { type: "string", pattern: SLUG_PATTERN },
      expectedEverySeconds: { type: "integer", minimum: 10, maximum: 86_400 * 7 },
      gracePeriodSeconds: { type: "integer", minimum: 0, maximum: 86_400 },
    },
  },
};

export default async function heartbeatsRoutes(app: FastifyInstance): Promise<void> {
  // ── Public ingest — no auth, rate-limited per slug ──
  app.post<{ Params: { slug: string } }>(
    "/ping/:slug",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        params: {
          type: "object" as const,
          required: ["slug"],
          properties: { slug: { type: "string", pattern: SLUG_PATTERN } },
        },
      },
    },
    async (req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
      const monitor = app.store.HeartbeatMonitors.findBySlug(req.params.slug);
      if (!monitor || !monitor.isActive) {
        return reply.status(404).send({ error: "Heartbeat monitor not found" });
      }
      recordPing(monitor);
      return reply.status(200).send({ ok: true });
    },
  );

  // ── Authenticated CRUD ──
  app.register(async (scoped) => {
    scoped.addHook("preHandler", app.authenticate);

    scoped.get("/", async (req: FastifyRequest) => app.store.HeartbeatMonitors.find(req.user._id));

    scoped.post("/", { schema: createSchema }, async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as {
        name: string; slug: string;
        expectedEverySeconds: number; gracePeriodSeconds?: number;
      };
      // Prevent slug collisions (globally — slugs are URL-public identifiers).
      if (app.store.HeartbeatMonitors.findBySlug(body.slug)) {
        return reply.status(409).send({ error: "Slug already in use" });
      }
      const monitor = app.store.HeartbeatMonitors.create({
        userId: req.user._id,
        name: body.name.trim(),
        slug: body.slug,
        expectedEverySeconds: body.expectedEverySeconds,
        gracePeriodSeconds: body.gracePeriodSeconds ?? 30,
      });
      return reply.status(201).send(monitor);
    });

    scoped.delete("/:monitorId", async (req: FastifyRequest<{ Params: { monitorId: string } }>, reply: FastifyReply) => {
      const removed = app.store.HeartbeatMonitors.delete(req.params.monitorId, req.user._id);
      if (!removed) return reply.status(404).send({ error: "Heartbeat monitor not found" });
      return { success: true };
    });

    scoped.patch("/:monitorId/toggle", async (req: FastifyRequest<{ Params: { monitorId: string } }>, reply: FastifyReply) => {
      const monitor = app.store.HeartbeatMonitors.toggleActive(req.params.monitorId, req.user._id);
      if (!monitor) return reply.status(404).send({ error: "Heartbeat monitor not found" });
      return monitor;
    });
  });
}
