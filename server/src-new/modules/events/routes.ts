// ── Events route module ──
// GET /api/events — cursor-paginated unified timeline
// GET /api/events/correlate — events around a given timestamp (for alert drill-down)

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { EventKind } from "../../shared/types.js";

const KIND_VALUES: EventKind[] = [
  "metric",
  "alert_fired",
  "alert_resolved",
  "http_check",
  "tcp_check",
  "ping_check",
  "dns_check",
  "heartbeat_ping",
  "heartbeat_missed",
  "heartbeat_recovered",
  "pipeline",
  "server_online",
  "server_offline",
  "anomaly",
  "incident_created",
  "incident_updated",
  "incident_resolved",
];

export default async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get(
    "/",
    {
      schema: {
        querystring: {
          type: "object" as const,
          properties: {
            cursor: { type: "string" }, // ms-since-epoch as string (safe in URL)
            limit: { type: "integer", minimum: 1, maximum: 500 },
            kinds: { type: "string" }, // CSV list
            source: { type: "string" },
            since: { type: "string" }, // ms since epoch
          },
        },
      },
    },
    async (req: FastifyRequest) => {
      const q = req.query as {
        cursor?: string;
        limit?: number;
        kinds?: string;
        source?: string;
        since?: string;
      };
      const cursor = q.cursor ? Number(q.cursor) : null;
      const since = q.since ? Number(q.since) : null;
      const kindsList = q.kinds
        ? q.kinds
            .split(",")
            .map((s) => s.trim())
            .filter((s): s is EventKind => (KIND_VALUES as string[]).includes(s))
        : null;

      const items = app.store.Events.list({
        userId: req.user._id,
        cursor: Number.isFinite(cursor) ? cursor : null,
        since: Number.isFinite(since) ? since : null,
        limit: q.limit ?? 100,
        kinds: kindsList,
        source: q.source ?? null,
      });

      const nextCursor = items.length > 0 ? String(items[items.length - 1].time) : null;
      return { items, nextCursor };
    },
  );

  // GET /api/events/correlate?time=<ms>&windowMs=<ms>
  app.get(
    "/correlate",
    {
      schema: {
        querystring: {
          type: "object" as const,
          required: ["time"],
          properties: {
            time: { type: "string" },
            windowMs: { type: "integer", minimum: 1_000, maximum: 24 * 60 * 60 * 1000 },
          },
        },
      },
    },
    async (req: FastifyRequest) => {
      const q = req.query as { time: string; windowMs?: number };
      const t = Number(q.time);
      if (!Number.isFinite(t)) return { items: [] };
      const windowMs = q.windowMs ?? 10 * 60 * 1000;
      return { items: app.store.Events.around(req.user._id, t, windowMs) };
    },
  );
}
