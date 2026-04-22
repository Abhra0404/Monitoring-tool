/**
 * Security hardening tests — lockout, audit log, CORS pin, /health/ready.
 * Runs against the in-memory store (no DATABASE_URL, no REDIS_URL).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";

const ADMIN_EMAIL = "sec-admin@theoria.local";
const ADMIN_PASSWORD = "sec-admin-password-123";

let app: FastifyInstance;
let accessToken: string;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;

  app = await buildApp({ skipClientBuild: true, skipSwagger: true, logger: false });
  await app.ready();

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  accessToken = login.json().accessToken;
});

afterAll(async () => {
  await app.close();
});

describe("account lockout", () => {
  it("locks the account after 5 failed login attempts", async () => {
    app.lockout.__resetForTests();
    const ip = "10.0.0.1";

    for (let i = 0; i < 4; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: ADMIN_EMAIL, password: "wrong-password" },
        remoteAddress: ip,
      });
      expect(res.statusCode).toBe(401);
    }

    // 5th failure triggers the lock.
    const fifth = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: ADMIN_EMAIL, password: "wrong-password" },
      remoteAddress: ip,
    });
    expect(fifth.statusCode).toBe(401);

    // Correct password is now rejected because the account is locked.
    const blocked = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      remoteAddress: ip,
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("unlocks and clears counter after a successful login", async () => {
    app.lockout.__resetForTests();
    const ip = "10.0.0.2";

    // Two failures, then success, should clear the counter.
    for (let i = 0; i < 2; i++) {
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: ADMIN_EMAIL, password: "wrong-password-long" },
        remoteAddress: ip,
      });
    }
    const good = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      remoteAddress: ip,
    });
    expect(good.statusCode).toBe(200);

    // Two more failures must not trip the lock since the counter reset.
    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: ADMIN_EMAIL, password: "wrong-password-long" },
        remoteAddress: ip,
      });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("audit log", () => {
  it("records key rotation events", async () => {
    app.lockout.__resetForTests();
    app.store.AuditLog.replaceAll([]);

    const rotate = await app.inject({
      method: "POST",
      url: "/api/auth/regenerate-key",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(rotate.statusCode).toBe(200);

    const log = app.store.AuditLog.listAll();
    const rotation = log.find((e) => e.action === "auth.api_key.rotated");
    expect(rotation).toBeDefined();
    expect(rotation?.userId).toBeTruthy();
  });

  it("records successful and failed login events", async () => {
    app.lockout.__resetForTests();
    app.store.AuditLog.replaceAll([]);
    const ip = "10.0.0.3";

    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: ADMIN_EMAIL, password: "nope-but-long-enough" },
      remoteAddress: ip,
    });
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      remoteAddress: ip,
    });

    const actions = app.store.AuditLog.listAll().map((e) => e.action);
    expect(actions).toContain("auth.login.failed");
    expect(actions).toContain("auth.login.success");
  });
});

describe("health endpoints", () => {
  it("/health/live always returns 200", async () => {
    const res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });

  it("/health/ready returns 200 when no external deps are configured", async () => {
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ready");
  });

  it("emits an x-request-id header", async () => {
    const res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(typeof res.headers["x-request-id"]).toBe("string");
  });

  it("echoes an inbound x-request-id header", async () => {
    const rid = "req_1234567890abcdef";
    const res = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-request-id": rid },
    });
    expect(res.headers["x-request-id"]).toBe(rid);
  });
});
