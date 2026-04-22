/**
 * Integration tests — exercise every module through Fastify's app.inject().
 * Runs against the in-memory store (no DATABASE_URL).
 *
 * Auth model under test:
 *  - Dashboard routes require a JWT access token (acquired via /api/auth/login).
 *  - Agent-only POST /metrics requires the system user's API key.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

let app: FastifyInstance;
let systemApiKey: string;
let accessToken: string;
let refreshToken: string;

const ADMIN_EMAIL = "admin-test@theoria.local";
const ADMIN_PASSWORD = "super-secret-123";

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;

  app = await buildApp({
    skipClientBuild: true,
    skipSwagger: true,
    logger: false,
    config: { NODE_ENV: "test" },
  });
  await app.ready();

  const systemUser = app.store.systemUser;
  if (!systemUser) throw new Error("System user not initialized");
  systemApiKey = systemUser.apiKey;

  // Log in as the bootstrap admin.
  const loginRes = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (loginRes.statusCode !== 200) {
    throw new Error(`Login failed: ${loginRes.statusCode} ${loginRes.body}`);
  }
  const body = loginRes.json();
  accessToken = body.accessToken;
  refreshToken = body.refreshToken;
});

afterAll(async () => {
  await app.close();
});

const apiKeyHeaders = () => ({ authorization: `Bearer ${systemApiKey}` });
const jwtHeaders = () => ({ authorization: `Bearer ${accessToken}` });

describe("health", () => {
  it("GET /health returns in-memory status", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("healthy");
    expect(body.storage).toBe("in-memory");
  });
});

describe("auth module", () => {
  it("GET /api/auth/me rejects unauthenticated requests", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/auth/login rejects bad credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: ADMIN_EMAIL, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/auth/me returns the logged-in user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe(ADMIN_EMAIL);
    expect(body.user.role).toBe("admin");
  });

  it("POST /api/auth/refresh rotates tokens and invalidates old refresh token", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken },
    });
    expect(first.statusCode).toBe(200);
    const body = first.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.refreshToken).not.toBe(refreshToken);

    // Old token must now be revoked.
    const replay = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it("POST /api/auth/logout revokes the current refresh token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(200);

    const replay = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    // Re-login for the rest of the suite.
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    const body = login.json();
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it("POST /api/auth/regenerate-key rotates the API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/regenerate-key",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.apiKey).toBeTruthy();
  });
});

describe("metrics ingestion (apiKey auth)", () => {
  it("rejects POST /metrics without API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      payload: { serverId: "srv-test-1", cpu: 10, totalMem: 1000, freeMem: 500 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts a metric payload and registers the server", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      headers: apiKeyHeaders(),
      payload: {
        serverId: "srv-test-1",
        hostname: "test-host",
        cpu: 42.5,
        totalMem: 8_000_000_000,
        freeMem: 4_000_000_000,
        uptime: 3600,
        platform: "linux",
        arch: "x64",
        cpuCount: 4,
      },
    });
    expect(res.statusCode).toBeLessThan(400);
  });
});

describe("servers module (JWT auth)", () => {
  it("rejects without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/servers/" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/servers/ lists the server registered by the agent", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/servers/",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const servers = res.json();
    expect(Array.isArray(servers)).toBe(true);
  });
});

describe("alerts module", () => {
  let ruleId: string;

  it("POST /api/alerts/rules creates a rule", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/alerts/rules",
      headers: jwtHeaders(),
      payload: {
        name: "High CPU",
        metricName: "cpu",
        operator: ">",
        threshold: 90,
        durationMinutes: 0,
        isActive: true,
      },
    });
    expect(res.statusCode).toBeLessThan(400);
    const body = res.json();
    ruleId = body._id || body.id;
    expect(ruleId).toBeTruthy();
  });

  it("GET /api/alerts/rules lists rules", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/alerts/rules",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("PATCH /api/alerts/rules/:id/toggle toggles state", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/alerts/rules/${ruleId}/toggle`,
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });

  it("DELETE /api/alerts/rules/:id removes the rule", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/alerts/rules/${ruleId}`,
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it("GET /api/alerts/history returns an array", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/alerts/history",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});

describe("http-checks module", () => {
  let checkId: string;

  it("POST /api/http-checks/ rejects invalid URL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/http-checks/",
      headers: jwtHeaders(),
      payload: { name: "Bad", url: "not-a-url" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/http-checks/ creates a check", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/http-checks/",
      headers: jwtHeaders(),
      payload: {
        name: "Example",
        url: "https://example.com",
        interval: 60_000,
        expectedStatus: 200,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    checkId = body._id || body.id;
    expect(checkId).toBeTruthy();
  });

  it("GET /api/http-checks/ lists checks", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/http-checks/",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("DELETE /api/http-checks/:id removes the check", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/http-checks/${checkId}`,
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("notifications module", () => {
  it("POST /api/notifications/channels rejects missing required config", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notifications/channels",
      headers: jwtHeaders(),
      payload: { type: "slack", name: "x", config: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/notifications/channels creates a Slack channel", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notifications/channels",
      headers: jwtHeaders(),
      payload: {
        type: "slack",
        name: "Test Slack",
        config: { webhookUrl: "https://hooks.slack.com/services/T/B/X" },
      },
    });
    expect(res.statusCode).toBeLessThan(400);
  });

  it("GET /api/notifications/channels lists channels", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/notifications/channels",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});

describe("pipelines module", () => {
  it("GET /api/pipelines/ returns an array", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/pipelines/",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("GET /api/pipelines/stats returns stats object", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/pipelines/stats",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json()).toBe("object");
  });
});

describe("docker module", () => {
  it("GET /api/docker/ returns an array", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/docker/",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});

describe("status-page module", () => {
  it("GET /api/status-page/config returns a config object", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/status-page/config",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json()).toBe("object");
  });

  it("GET /api/status-page/public is 404 when not enabled", async () => {
    const res = await app.inject({ method: "GET", url: "/api/status-page/public" });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /api/status-page/config enables the public page", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/status-page/config",
      headers: jwtHeaders(),
      payload: { title: "Theoria", isPublic: true },
    });
    expect(res.statusCode).toBe(200);

    const pub = await app.inject({ method: "GET", url: "/api/status-page/public" });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().title).toBe("Theoria");
  });
});

describe("events module", () => {
  it("GET /api/events requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/events" });
    expect(res.statusCode).toBe(401);
  });

  it("records events and filters by kind", async () => {
    // Create an incident as the admin — this emits an incident_created event
    // under the admin user, which the admin JWT can then see via /api/events.
    const create = await app.inject({
      method: "POST",
      url: "/api/incidents",
      headers: jwtHeaders(),
      payload: { title: "Events-probe incident", message: "smoke test" },
    });
    expect(create.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: "/api/events?kinds=incident_created&limit=50",
      headers: jwtHeaders(),
    });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(Array.isArray(body.items)).toBe(true);
    const match = body.items.find(
      (e: { kind: string; title: string }) =>
        e.kind === "incident_created" && e.title.includes("Events-probe incident"),
    );
    expect(match).toBeTruthy();
  });

  it("GET /api/events/correlate returns events around a timestamp", async () => {
    const now = Date.now();
    const res = await app.inject({
      method: "GET",
      url: `/api/events/correlate?time=${now}&windowMs=60000`,
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().items)).toBe(true);
  });
});

describe("incidents module", () => {
  let incidentId: string;

  it("POST /api/incidents creates an incident with an initial update", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/incidents",
      headers: jwtHeaders(),
      payload: {
        title: "DB latency spike",
        message: "Investigating elevated latency on shard 3",
        severity: "major",
        services: ["api", "database"],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("investigating");
    expect(body.severity).toBe("major");
    expect(body.updates).toHaveLength(1);
    expect(body.updates[0].message).toContain("shard 3");
    incidentId = body._id;
  });

  it("GET /api/incidents returns the new incident", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/incidents",
      headers: jwtHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ _id: string }>;
    expect(items.find((i) => i._id === incidentId)).toBeTruthy();
  });

  it("POST /api/incidents/:id/updates advances the state machine", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/incidents/${incidentId}/updates`,
      headers: jwtHeaders(),
      payload: { status: "identified", message: "Root cause: saturated connection pool." },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("identified");
  });

  it("rejects illegal transitions", async () => {
    // First resolve the incident.
    await app.inject({
      method: "POST",
      url: `/api/incidents/${incidentId}/updates`,
      headers: jwtHeaders(),
      payload: { status: "resolved", message: "Rolled back deploy." },
    });
    // "resolved" -> "identified" is not legal; only "investigating" is.
    const res = await app.inject({
      method: "POST",
      url: `/api/incidents/${incidentId}/updates`,
      headers: jwtHeaders(),
      payload: { status: "identified", message: "Trying to jump states" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("public/active returns incidents when the status page is enabled", async () => {
    // Status page was enabled earlier in the test file. Create a fresh active
    // incident to show up in the feed.
    const created = await app.inject({
      method: "POST",
      url: "/api/incidents",
      headers: jwtHeaders(),
      payload: { title: "Public incident", message: "Investigating." },
    });
    expect(created.statusCode).toBe(201);
    const res = await app.inject({
      method: "GET",
      url: "/api/incidents/public/active",
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{ title: string }>;
    expect(items.some((i) => i.title === "Public incident")).toBe(true);
  });
});

describe("status-page Phase 3 extras", () => {
  it("GET /api/status-page/public/uptime returns a per-day array", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/status-page/public/uptime?days=14",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.days).toBe(14);
    expect(Array.isArray(body.checks)).toBe(true);
  });

  it("GET /api/status-page/badge/overall serves an SVG", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/status-page/badge/overall",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(res.body).toContain("<svg");
  });

  it("GET /api/status-page/public/rss serves an RSS feed", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/status-page/public/rss",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/rss+xml");
    expect(res.body).toContain("<rss");
  });

  it("GET /api/status-page/ask rejects when no customDomain is configured", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/status-page/ask?domain=status.example.com",
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/status-page/ask approves a matching customDomain and rejects others", async () => {
    // Configure a custom domain via the authenticated PUT endpoint.
    const put = await app.inject({
      method: "PUT",
      url: "/api/status-page/config",
      headers: jwtHeaders(),
      payload: { title: "Theoria", isPublic: true, customDomain: "status.example.com" },
    });
    expect(put.statusCode).toBe(200);

    const ok = await app.inject({
      method: "GET",
      url: "/api/status-page/ask?domain=status.example.com",
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true, domain: "status.example.com" });

    const nope = await app.inject({
      method: "GET",
      url: "/api/status-page/ask?domain=evil.example.com",
    });
    expect(nope.statusCode).toBe(404);

    const missing = await app.inject({
      method: "GET",
      url: "/api/status-page/ask",
    });
    expect(missing.statusCode).toBe(400);
  });
});

// ── Phase 4: Plugins ──────────────────────────────────────────────────────
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _setPluginsRoot } from "../modules/plugins/routes.js";
import { buildRoot } from "../modules/plugins/registry.js";

describe("plugins module", () => {
  let pluginRoot: string;

  beforeAll(() => {
    pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), "theoria-plugins-intg-"));
    fs.mkdirSync(path.join(pluginRoot, "node_modules"), { recursive: true });
    // Install a stub plugin.
    const dir = path.join(pluginRoot, "node_modules", "theoria-plugin-stub");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "theoria-plugin-stub", version: "1.0.0" }));
    fs.writeFileSync(path.join(dir, "theoria-plugin.json"), JSON.stringify({
      name: "theoria-plugin-stub",
      displayName: "Stub",
      version: "1.0.0",
      type: "server-check",
      entry: "index.js",
      intervalSeconds: 60,
      timeoutMs: 5000,
      metrics: [{ name: "probe", description: "Probe counter" }],
      configSchema: {
        type: "object",
        properties: {
          host: { type: "string" },
          password: { type: "string", format: "password" },
        },
      },
    }));
    fs.writeFileSync(path.join(dir, "index.js"),
      "exports.check = async (c) => ({ status: 'up', latencyMs: 1, detail: { echo: c.host }, metrics: { probe: 1 } });");

    _setPluginsRoot(buildRoot(pluginRoot));
  });

  afterAll(() => {
    try { fs.rmSync(pluginRoot, { recursive: true, force: true }); } catch { /* swallow */ }
  });

  it("GET /api/plugins returns installed plugins", async () => {
    const res = await app.inject({ method: "GET", url: "/api/plugins/", headers: jwtHeaders() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.installed.map((p: { name: string }) => p.name)).toContain("theoria-plugin-stub");
  });

  it("POST /api/plugins/instances creates an instance and POST /instances/:id/run executes it", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/plugins/instances",
      headers: jwtHeaders(),
      payload: { name: "theoria-plugin-stub", config: { host: "demo", password: "s3cret" }, enabled: false },
    });
    expect(create.statusCode).toBe(201);
    const instId = create.json().id;

    const run = await app.inject({
      method: "POST",
      url: `/api/plugins/instances/${instId}/run`,
      headers: jwtHeaders(),
    });
    expect(run.statusCode).toBe(200);
    const runBody = run.json();
    expect(runBody.ok).toBe(true);
    expect((runBody.data as { status: string }).status).toBe("up");

    // Confirm the /api/plugins/ view redacts the password.
    const list = await app.inject({ method: "GET", url: "/api/plugins/", headers: jwtHeaders() });
    const inst = list.json().instances.find((i: { id: string }) => i.id === instId);
    expect(inst.config.password).not.toBe("s3cret");

    // Delete so later runs don't leak state.
    const del = await app.inject({
      method: "DELETE",
      url: `/api/plugins/instances/${instId}`,
      headers: jwtHeaders(),
    });
    expect(del.statusCode).toBe(204);
  });

  it("POST /api/plugins/instances rejects unknown plugin names with 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/plugins/instances",
      headers: jwtHeaders(),
      payload: { name: "does-not-exist", config: {} },
    });
    expect(res.statusCode).toBe(404);
  });

  it("requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/plugins/" });
    expect(res.statusCode).toBe(401);
  });
});

// ── Phase 5: OTLP ingestion + Prometheus exposition ───────────────────────

describe("OTLP metric ingestion (POST /v1/metrics)", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/metrics", payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it("accepts a valid OTLP/HTTP JSON payload and stores metrics", async () => {
    const payload = {
      resourceMetrics: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "order-svc" } }],
          },
          scopeMetrics: [
            {
              scope: { name: "meter" },
              metrics: [
                {
                  name: "orders.placed",
                  sum: {
                    isMonotonic: true,
                    dataPoints: [
                      { asInt: "17", timeUnixNano: "1700000000000000000" },
                      { asInt: "3", timeUnixNano: "1700000005000000000" },
                    ],
                  },
                },
                {
                  name: "request.latency",
                  gauge: {
                    dataPoints: [{ asDouble: 42.7 }],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics",
      headers: apiKeyHeaders(),
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(3);
  });

  it("returns { accepted: 0 } for an empty payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/metrics",
      headers: apiKeyHeaders(),
      payload: { resourceMetrics: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(0);
  });
});

describe("Prometheus internal metrics", () => {
  it("GET /internal/metrics returns the exposition format", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("# HELP theoria_api_requests_total");
    expect(res.body).toContain("# TYPE theoria_agents_connected gauge");
    expect(res.body).toContain("theoria_metrics_ingested_total");
  });

  it("counts OTLP ingest toward theoria_metrics_ingested_total{source=\"otlp\"}", async () => {
    // Send one OTLP point so the counter is definitely non-zero.
    await app.inject({
      method: "POST",
      url: "/v1/metrics",
      headers: apiKeyHeaders(),
      payload: {
        resourceMetrics: [
          {
            scopeMetrics: [
              {
                metrics: [
                  { name: "probe.counter", gauge: { dataPoints: [{ asInt: "1" }] } },
                ],
              },
            ],
          },
        ],
      },
    });
    const res = await app.inject({ method: "GET", url: "/internal/metrics" });
    expect(res.body).toMatch(/theoria_metrics_ingested_total\{source="otlp"\}\s+[1-9]/);
  });
});
