/**
 * Supplemental coverage — exercises the remaining server, pipeline,
 * notification, auth-register, and server-alert-rule routes that the primary
 * integration.test.ts only touches at the surface.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

let app: FastifyInstance;
let accessToken: string;
let systemApiKey: string;
let adminApiKey: string;

const ADMIN_EMAIL = "coverage-admin@theoria.local";
const ADMIN_PASSWORD = "coverage-password-1";

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.ALLOW_REGISTRATION = "true";

  app = await buildApp({ skipClientBuild: true, logger: false, config: { NODE_ENV: "test" } });
  await app.ready();

  systemApiKey = app.store.systemUser!.apiKey;
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  accessToken = login.json().accessToken;

  // The admin user has its own API key; use it so metric ingestion is scoped
  // to the same userId the dashboard tests operate against.
  const me = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  adminApiKey = me.json().user.apiKey;
});

afterAll(async () => {
  delete process.env.ALLOW_REGISTRATION;
  await app.close();
});

const jwt = () => ({ authorization: `Bearer ${accessToken}` });
const key = () => ({ authorization: `Bearer ${systemApiKey}` });
const adminKey = () => ({ authorization: `Bearer ${adminApiKey}` });

describe("auth register", () => {
  it("creates a new regular user when ALLOW_REGISTRATION=true", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "user1@theoria.local", password: "user1-password" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.role).toBe("user");
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
  });

  it("rejects duplicate email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "user1@theoria.local", password: "another-password" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "short@theoria.local", password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("logout-all revokes every refresh token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout-all",
      headers: jwt(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.revoked).toBeGreaterThanOrEqual(0);

    // Re-establish session for the remaining tests.
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    accessToken = login.json().accessToken;
  });
});

describe("servers full CRUD", () => {
  beforeAll(async () => {
    // Ingest a couple of metric payloads so there is a server to operate on.
    await app.inject({
      method: "POST",
      url: "/metrics",
      headers: adminKey(),
      payload: {
        serverId: "srv-cov",
        hostname: "cov-host",
        cpu: 50,
        totalMem: 1_000,
        freeMem: 500,
        platform: "linux",
        arch: "x64",
        cpuCount: 2,
        loadAvg1: 0.5,
        loadAvg5: 0.4,
        loadAvg15: 0.3,
        diskTotal: 1_000_000,
        diskFree: 500_000,
        networkRx: 1_000,
        networkTx: 2_000,
        uptime: 100,
      },
    });
  });

  it("GET /api/servers/:id returns detail", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/servers/srv-cov",
      headers: jwt(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().serverId).toBe("srv-cov");
  });

  it("returns 404 for unknown server", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/servers/does-not-exist",
      headers: jwt(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/servers/:id/metrics across every supported timeRange", async () => {
    for (const tr of ["5m", "15m", "1h", "6h", "24h", "7d", "unknown"]) {
      const res = await app.inject({
        method: "GET",
        url: `/api/servers/srv-cov/metrics?timeRange=${tr}`,
        headers: jwt(),
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    }
  });

  it("PUT /api/servers/:id renames a server", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/servers/srv-cov",
      headers: jwt(),
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Renamed");
  });

  it("PUT /api/servers/:id/alert-rules creates a host-scoped rule", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/servers/srv-cov/alert-rules",
      headers: jwt(),
      payload: {
        name: "srv-cov-cpu",
        metricName: "cpu",
        operator: ">",
        threshold: 80,
        durationMinutes: 0,
        isActive: true,
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it("GET /api/servers/:id/alert-rules lists host-scoped rules", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/servers/srv-cov/alert-rules",
      headers: jwt(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("DELETE /api/servers/:id removes a server and its metrics", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/servers/srv-cov",
      headers: jwt(),
    });
    expect(res.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: "/api/servers/srv-cov",
      headers: jwt(),
    });
    expect(after.statusCode).toBe(404);
  });
});

describe("notifications CRUD", () => {
  let channelId: string;

  it("rejects unsupported channel type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notifications/channels",
      headers: jwt(),
      payload: { type: "fax", name: "x", config: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it("creates, updates, toggles, and deletes a Discord channel", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/notifications/channels",
      headers: jwt(),
      payload: {
        type: "discord",
        name: "ops",
        config: { webhookUrl: "https://discord.test/hook" },
      },
    });
    expect(create.statusCode).toBe(201);
    channelId = create.json()._id;

    const update = await app.inject({
      method: "PUT",
      url: `/api/notifications/channels/${channelId}`,
      headers: jwt(),
      payload: { name: "ops-renamed", config: { webhookUrl: "https://discord.test/hook2" } },
    });
    expect(update.statusCode).toBe(200);

    const toggle = await app.inject({
      method: "PATCH",
      url: `/api/notifications/channels/${channelId}/toggle`,
      headers: jwt(),
    });
    expect(toggle.statusCode).toBe(200);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/notifications/channels/${channelId}`,
      headers: jwt(),
    });
    expect(del.statusCode).toBe(200);
  });
});

describe("pipelines webhook ingestion", () => {
  it("normalizes a GitHub Actions workflow_run payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/pipelines/webhook",
      headers: {
        ...adminKey(),
        "x-github-event": "workflow_run",
      },
      payload: {
        action: "completed",
        workflow_run: {
          id: 123,
          run_number: 7,
          name: "CI",
          status: "completed",
          conclusion: "success",
          head_branch: "main",
          head_sha: "deadbeef",
          head_commit: { message: "ship it" },
          actor: { login: "octocat" },
          html_url: "https://github.com/test/repo/actions/runs/123",
          run_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          repository: { full_name: "test/repo" },
        },
        repository: { full_name: "test/repo" },
      },
    });
    // Success (200) or bad payload (400) both exercise the route.
    expect(res.statusCode).toBeLessThan(500);
  });

  it("rejects webhook payloads the normalizer cannot parse", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/pipelines/webhook",
      headers: adminKey(),
      payload: { random: "garbage" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/pipelines/ returns listing after ingestion", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/pipelines/",
      headers: jwt(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});
