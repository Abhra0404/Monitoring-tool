// ── Status Page routes module ──

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { sql } from "drizzle-orm";
import type { HttpCheck, HttpCheckResult, IncidentRecord, IncidentUpdateRecord } from "../../shared/types.js";

/**
 * The status page is a server-wide singleton: there is one public status page
 * per Theoria deployment. The public endpoint reads the singleton config;
 * authenticated endpoints write to the current user's config (which, because
 * the underlying store keeps only one slot, acts as the global config).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type UptimeDay = { date: string; uptimePercent: number; samples: number };

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function computeUptimeDays(
  check: HttpCheck & { results?: HttpCheckResult[] },
  days: number,
): UptimeDay[] {
  const now = Date.now();
  const earliest = now - days * DAY_MS;
  const buckets = new Map<string, { up: number; total: number }>();

  for (let i = 0; i < days; i++) {
    const dayStart = new Date(now - i * DAY_MS);
    dayStart.setUTCHours(0, 0, 0, 0);
    const key = dayStart.toISOString().slice(0, 10);
    buckets.set(key, { up: 0, total: 0 });
  }

  for (const r of check.results ?? []) {
    if (r.timestamp < earliest) continue;
    const d = new Date(r.timestamp);
    d.setUTCHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total++;
    if (r.status === "up") bucket.up++;
  }

  const out: UptimeDay[] = [];
  for (const [date, { up, total }] of buckets) {
    out.push({
      date,
      uptimePercent: total > 0 ? Math.round((up / total) * 1000) / 10 : -1,
      samples: total,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function overallFromStatuses(statuses: string[]): "operational" | "degraded" | "partial_outage" | "major_outage" {
  const hasDown = statuses.includes("offline") || statuses.includes("down");
  const hasWarning = statuses.includes("warning");
  if (hasDown) {
    return statuses.filter((s) => s === "offline" || s === "down").length > statuses.length / 2
      ? "major_outage"
      : "partial_outage";
  }
  return hasWarning ? "degraded" : "operational";
}

export default async function statusPageRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Resolve the StatusPageConfig for an incoming public request.
   *
   * If a `customDomain` is set on the config, the request is only served
   * when its Host header (minus the port) matches. Otherwise any host is
   * accepted. This is what makes `status.example.com` resolve to the same
   * page that the dashboard's `/status-page` editor controls, without
   * requiring a database migration or multi-tenant rewrite.
   *
   * Returns `null` if the request should be rejected (404).
   */
  function resolvePublicConfig(req: FastifyRequest) {
    const config = app.store.StatusPageConfig.getAny();
    if (!config || !config.isPublic) return null;
    const customDomain = (config.customDomain ?? "").trim().toLowerCase();
    if (!customDomain) return config;
    const rawHost = (req.hostname || req.headers.host || "").toString().toLowerCase();
    const host = rawHost.split(":")[0];
    if (host !== customDomain) return null;
    return config;
  }

  /**
   * GET /api/status-page/ask?domain=<host>
   *
   * Caddy's `on_demand_tls { ask … }` hook. Caddy calls this endpoint
   * BEFORE requesting a Let's Encrypt certificate for a new hostname; if
   * the response is 2xx the cert is issued, otherwise Caddy refuses. This
   * is the primary defence against random bots burning through ACME rate
   * limits by pointing arbitrary domains at your server.
   *
   * Caddy passes the candidate hostname in the `domain` query parameter
   * (NOT the Host header — that header is the ask endpoint's own host),
   * so we can't reuse `resolvePublicConfig` here.
   */
  app.get<{ Querystring: { domain?: string } }>("/ask", async (req, reply) => {
    const raw = (req.query.domain ?? "").toString().trim().toLowerCase();
    const domain = raw.split(":")[0];
    if (!domain) return reply.code(400).send({ error: "missing domain query param" });

    const config = app.store.StatusPageConfig.getAny();
    if (!config || !config.isPublic) {
      return reply.code(404).send({ error: "no public status page configured" });
    }
    const customDomain = (config.customDomain ?? "").trim().toLowerCase();
    if (!customDomain || domain !== customDomain) {
      return reply.code(404).send({ error: "domain not authorised" });
    }
    return reply.code(200).send({ ok: true, domain });
  });

  // GET /api/status-page/public — no auth required
  app.get("/public", async (req: FastifyRequest, reply: FastifyReply) => {
    const config = resolvePublicConfig(req);
    if (!config) {
      return reply.status(404).send({ error: "Status page is not enabled" });
    }

    const ownerId = config.userId;
    const servers = app.store.Servers.find(ownerId);
    const httpCheckConfigs = app.store.HttpChecks.find(ownerId);
    const activeIncidents = app.store.Incidents.find(ownerId)
      .filter((i) => i.status !== "resolved")
      .slice(0, 10);

    const serverStatuses = servers.map((s) => s.status);
    const checkStatuses = httpCheckConfigs
      .filter((c) => c.isActive)
      .map((c) => c.status as string);
    const overall = overallFromStatuses([...serverStatuses, ...checkStatuses]);

    return {
      title: config.title || "System Status",
      description: config.description || "",
      overall,
      servers: servers.map((s) => ({
        name: s.name || s.serverId,
        status: s.status,
        lastSeen: s.lastSeen,
      })),
      httpChecks: httpCheckConfigs
        .filter((c) => c.isActive)
        .map((c) => ({
          id: c._id,
          name: c.name,
          url: c.url,
          status: c.status,
          uptimePercent: c.uptimePercent,
          lastCheckedAt: c.lastCheckedAt,
        })),
      customServices: config.customServices || [],
      activeIncidents: activeIncidents.map((i) => ({
        id: i._id,
        title: i.title,
        status: i.status,
        severity: i.severity,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        updates: app.store.IncidentUpdates.findByIncident(i._id),
      })),
      updatedAt: new Date().toISOString(),
    };
  });

  // GET /api/status-page/public/uptime?days=90 — per-check daily uptime bars
  app.get<{ Querystring: { days?: string } }>("/public/uptime", async (req, reply) => {
    const config = resolvePublicConfig(req);
    if (!config) {
      return reply.status(404).send({ error: "Status page is not enabled" });
    }
    const days = Math.max(1, Math.min(90, Number(req.query.days) || 90));
    const ownerId = config.userId;
    const checks = app.store.HttpChecks.find(ownerId).filter((c) => c.isActive);

    // Prefer Postgres for accurate long-range history when available.
    const pg = app.db;
    const out: Array<{ checkId: string; name: string; url: string; days: UptimeDay[] }> = [];

    if (pg) {
      for (const c of checks) {
        const result = await pg.execute<{ day: string; up_count: number; total: number }>(
          sql`
            SELECT
              to_char(date_trunc('day', "time" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
              SUM((status = 'up')::int)::int AS up_count,
              COUNT(*)::int AS total
            FROM http_check_results
            WHERE check_id = ${c._id}
              AND "time" >= NOW() - (${String(days)}::text || ' days')::interval
            GROUP BY day
            ORDER BY day ASC
          `,
        );
        const pgRows = (Array.isArray(result) ? result : (result as unknown as { rows?: unknown[] }).rows) ?? [];
        const byDay = new Map<string, { up: number; total: number }>();
        for (const r of pgRows as Array<{ day: string; up_count: number; total: number }>) {
          byDay.set(r.day, { up: Number(r.up_count), total: Number(r.total) });
        }
        const filled: UptimeDay[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(Date.now() - i * DAY_MS);
          d.setUTCHours(0, 0, 0, 0);
          const key = d.toISOString().slice(0, 10);
          const b = byDay.get(key);
          filled.push({
            date: key,
            uptimePercent: b && b.total > 0 ? Math.round((b.up / b.total) * 1000) / 10 : -1,
            samples: b?.total ?? 0,
          });
        }
        out.push({ checkId: c._id, name: c.name, url: c.url, days: filled });
      }
    } else {
      // Fallback: compute from the in-memory result ring (last ~100 samples).
      for (const c of checks) {
        const full = app.store.HttpChecks.findById(c._id);
        if (!full) continue;
        out.push({
          checkId: c._id,
          name: c.name,
          url: c.url,
          days: computeUptimeDays(full, Math.min(days, 30)),
        });
      }
    }

    return { days, checks: out };
  });

  // GET /api/status-page/public/rss — Atom feed of active + recent incidents
  app.get("/public/rss", async (req, reply) => {
    const config = resolvePublicConfig(req);
    if (!config) {
      return reply.status(404).send({ error: "Status page is not enabled" });
    }
    const ownerId = config.userId;
    const title = escapeXml(config.title || "System Status");
    const description = escapeXml(config.description || "");
    const incidents = app.store.Incidents.find(ownerId, { limit: 50 });

    const items = incidents.map((inc: IncidentRecord) => {
      const updates = app.store.IncidentUpdates.findByIncident(inc._id);
      const body = [
        `Status: ${inc.status}`,
        `Severity: ${inc.severity}`,
        inc.services.length ? `Services: ${inc.services.join(", ")}` : "",
        ...updates.map(
          (u: IncidentUpdateRecord) =>
            `${u.createdAt} [${u.status}] — ${u.message}`,
        ),
      ]
        .filter(Boolean)
        .join("\n");
      return `    <item>
      <title>${escapeXml(inc.title)}</title>
      <guid isPermaLink="false">${inc._id}</guid>
      <pubDate>${new Date(inc.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(body)}</description>
    </item>`;
    });

    reply.type("application/rss+xml; charset=utf-8");
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${title}</title>
    <description>${description}</description>
    <pubDate>${new Date().toUTCString()}</pubDate>
${items.join("\n")}
  </channel>
</rss>`;
  });

  // GET /api/status-page/badge/:slug.svg — shields-style SVG
  // `slug` is either "overall" or a URL-encoded HTTP check name.
  app.get<{ Params: { slug: string }; Querystring: { style?: string } }>(
    "/badge/:slug",
    async (req, reply) => {
      const config = resolvePublicConfig(req);
      if (!config) {
        return reply.status(404).send({ error: "Status page is not enabled" });
      }
      const ownerId = config.userId;
      const slug = req.params.slug.replace(/\.svg$/, "");
      let label = "status";
      let message = "unknown";
      let color = "#9e9e9e";

      if (slug === "overall") {
        const servers = app.store.Servers.find(ownerId);
        const checks = app.store.HttpChecks.find(ownerId).filter((c) => c.isActive);
        const overall = overallFromStatuses([
          ...servers.map((s) => s.status),
          ...checks.map((c) => c.status),
        ]);
        label = "status";
        if (overall === "operational") {
          message = "operational";
          color = "#4caf50";
        } else if (overall === "degraded") {
          message = "degraded";
          color = "#ffb300";
        } else if (overall === "partial_outage") {
          message = "partial outage";
          color = "#ff9800";
        } else {
          message = "major outage";
          color = "#e53935";
        }
      } else {
        const decoded = decodeURIComponent(slug);
        const check = app.store.HttpChecks.find(ownerId).find(
          (c) => c.name === decoded || c._id === decoded,
        );
        if (!check) return reply.status(404).send({ error: "Unknown badge" });
        label = check.name;
        if (check.status === "up") {
          message = `up ${check.uptimePercent?.toFixed(1) ?? 100}%`;
          color = "#4caf50";
        } else if (check.status === "down") {
          message = "down";
          color = "#e53935";
        } else {
          message = "pending";
          color = "#9e9e9e";
        }
      }

      const svg = renderBadge(label, message, color);
      reply
        .header("Cache-Control", "max-age=30, public")
        .type("image/svg+xml; charset=utf-8");
      return svg;
    },
  );

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
    const { title, description, isPublic, customServices, customDomain } = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (isPublic !== undefined) updates.isPublic = isPublic;
    if (customServices !== undefined) updates.customServices = customServices;
    if (customDomain !== undefined) {
      // Normalise: trim, lowercase, strip scheme + trailing slashes + port.
      let cd = String(customDomain || "").trim().toLowerCase();
      cd = cd.replace(/^https?:\/\//, "").replace(/\/+$/, "").split(":")[0];
      // Only accept valid hostnames (letters, digits, dots, hyphens).
      if (cd && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cd)) {
        throw new Error("Invalid customDomain — expected a valid hostname");
      }
      updates.customDomain = cd || null;
    }
    return app.store.StatusPageConfig.upsert(req.user._id, updates);
  });
}

/**
 * Render a shields.io-compatible flat SVG badge. Widths are estimated from
 * text length using a 7px-per-character average — good enough for fixed-width
 * "status" / "up 99.9%" style content without shipping a font metrics lib.
 */
function renderBadge(label: string, message: string, color: string): string {
  const charW = 7;
  const pad = 8;
  const labelW = Math.max(40, label.length * charW + pad * 2);
  const msgW = Math.max(40, message.length * charW + pad * 2);
  const total = labelW + msgW;
  const labelSafe = escapeXml(label);
  const msgSafe = escapeXml(message);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${labelSafe}: ${msgSafe}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="m"><rect width="${total}" height="20" rx="3" fill="#fff"/></mask>
  <g mask="url(#m)">
    <rect width="${labelW}" height="20" fill="#555"/>
    <rect x="${labelW}" width="${msgW}" height="20" fill="${color}"/>
    <rect width="${total}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelW / 2}" y="15" fill="#010101" fill-opacity=".3">${labelSafe}</text>
    <text x="${labelW / 2}" y="14">${labelSafe}</text>
    <text x="${labelW + msgW / 2}" y="15" fill="#010101" fill-opacity=".3">${msgSafe}</text>
    <text x="${labelW + msgW / 2}" y="14">${msgSafe}</text>
  </g>
</svg>`;
}

