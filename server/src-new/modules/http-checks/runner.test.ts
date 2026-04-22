/**
 * HTTP check runner tests — exercise the full runCheck path against a
 * locally-bound Node http.Server so the HTTP request, status-code comparison,
 * response-time tracking, and uptime percentage logic are all executed end to
 * end. No mocks.
 */

import http from "http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EventEmitter } from "events";
import type { Server as SocketIOServer } from "socket.io";
import type { Store } from "../../store/index.js";
import {
  initRunner,
  scheduleCheck,
  unscheduleCheck,
  rescheduleCheck,
} from "./runner.js";

// ── Minimal fake store ────────────────────────────────────────────────────

function makeFakeStore() {
  const checks = new Map<
    string,
    Record<string, unknown> & { results: Array<Record<string, unknown>> }
  >();
  return {
    HttpChecks: {
      findById: (id: string) => checks.get(id) ?? null,
      update: (id: string, updates: Record<string, unknown>) => {
        const c = checks.get(id);
        if (!c) return null;
        Object.assign(c, updates);
        return c;
      },
      findActive: () =>
        Array.from(checks.values()).filter((c) => c.isActive) as never,
      _set: (c: Record<string, unknown> & { _id: string }) => {
        checks.set(c._id, {
          ...c,
          results: [],
        } as never);
      },
    },
    AlertRules: { find: () => [] as never },
    AlertHistory: { findFiring: () => null as never, create: () => ({} as never) },
    NotificationChannels: { findActive: () => [] as never },
  } as unknown as Store;
}

class FakeIO extends EventEmitter {
  public emitted: Array<{ room: string; event: string; data: unknown }> = [];
  to(room: string) {
    return {
      emit: (event: string, data: unknown) => {
        this.emitted.push({ room, event, data });
      },
    };
  }
}

// ── HTTP test server ──────────────────────────────────────────────────────

let server: http.Server;
let port = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    } else if (req.url === "/slow") {
      setTimeout(() => {
        res.writeHead(200);
        res.end("slow");
      }, 50);
    } else {
      res.writeHead(500);
      res.end("error");
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function flushMicrotasks(ms = 150): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("HTTP runner lifecycle", () => {
  afterEach(() => {
    // no-op — each test uses its own check id
  });

  it("schedules a check, performs an HTTP request, records uptime", async () => {
    const store = makeFakeStore();
    const io = new FakeIO();
    initRunner(store, io as unknown as SocketIOServer);

    const check = {
      _id: "chk-200",
      userId: "u1",
      name: "OK",
      url: `http://127.0.0.1:${port}/ok`,
      interval: 60_000,
      expectedStatus: 200,
      isActive: true,
      status: "pending",
      lastCheckedAt: null,
      lastResponseTime: null,
      lastStatusCode: null,
      sslExpiry: null,
      uptimePercent: 100,
    };
    (store.HttpChecks as unknown as { _set: (c: unknown) => void })._set(check);

    scheduleCheck(check);
    await flushMicrotasks(200);
    unscheduleCheck(check._id);

    const updated = store.HttpChecks.findById(check._id) as Record<string, unknown>;
    expect(updated.status).toBe("up");
    expect(updated.lastStatusCode).toBe(200);
    expect((updated.lastResponseTime as number) ?? -1).toBeGreaterThanOrEqual(0);
    expect(updated.uptimePercent).toBe(100);
    expect(io.emitted.some((e) => e.event === "httpcheck:result")).toBe(true);
  });

  it("records status=down when the server returns a non-matching code", async () => {
    const store = makeFakeStore();
    const io = new FakeIO();
    initRunner(store, io as unknown as SocketIOServer);

    const check = {
      _id: "chk-500",
      userId: "u1",
      name: "Server err",
      url: `http://127.0.0.1:${port}/err`,
      interval: 60_000,
      expectedStatus: 200,
      isActive: true,
      status: "pending",
      lastCheckedAt: null,
      lastResponseTime: null,
      lastStatusCode: null,
      sslExpiry: null,
      uptimePercent: 100,
    };
    (store.HttpChecks as unknown as { _set: (c: unknown) => void })._set(check);

    scheduleCheck(check);
    await flushMicrotasks(200);
    unscheduleCheck(check._id);

    const updated = store.HttpChecks.findById(check._id) as Record<string, unknown>;
    expect(updated.status).toBe("down");
    expect(updated.lastStatusCode).toBe(500);
  });

  it("unscheduleCheck stops the interval", async () => {
    const store = makeFakeStore();
    const io = new FakeIO();
    initRunner(store, io as unknown as SocketIOServer);

    const check = {
      _id: "chk-stop",
      userId: "u1",
      name: "stop",
      url: `http://127.0.0.1:${port}/ok`,
      interval: 60_000,
      expectedStatus: 200,
      isActive: true,
      status: "pending",
      lastCheckedAt: null,
      lastResponseTime: null,
      lastStatusCode: null,
      sslExpiry: null,
      uptimePercent: 100,
    };
    (store.HttpChecks as unknown as { _set: (c: unknown) => void })._set(check);

    scheduleCheck(check);
    await flushMicrotasks(200);
    unscheduleCheck(check._id);

    const countAfterStop = io.emitted.length;
    await flushMicrotasks(200);
    // No additional runs (interval is 60s; we only get the immediate run).
    expect(io.emitted.length).toBe(countAfterStop);
  });

  it("rescheduleCheck is a no-op when isActive=false", async () => {
    const store = makeFakeStore();
    const io = new FakeIO();
    initRunner(store, io as unknown as SocketIOServer);

    const check = {
      _id: "chk-reschedule",
      userId: "u1",
      name: "x",
      url: `http://127.0.0.1:${port}/ok`,
      interval: 60_000,
      expectedStatus: 200,
      isActive: false,
      status: "pending",
      lastCheckedAt: null,
      lastResponseTime: null,
      lastStatusCode: null,
      sslExpiry: null,
      uptimePercent: 100,
    };
    (store.HttpChecks as unknown as { _set: (c: unknown) => void })._set(check);

    rescheduleCheck(check);
    await flushMicrotasks(200);
    expect(io.emitted.length).toBe(0);
  });

  it("treats invalid URLs as down", async () => {
    const store = makeFakeStore();
    const io = new FakeIO();
    initRunner(store, io as unknown as SocketIOServer);

    const check = {
      _id: "chk-bad",
      userId: "u1",
      name: "bad",
      url: "not-a-valid-url",
      interval: 60_000,
      expectedStatus: 200,
      isActive: true,
      status: "pending",
      lastCheckedAt: null,
      lastResponseTime: null,
      lastStatusCode: null,
      sslExpiry: null,
      uptimePercent: 100,
    };
    (store.HttpChecks as unknown as { _set: (c: unknown) => void })._set(check);

    scheduleCheck(check);
    await flushMicrotasks(200);
    unscheduleCheck(check._id);

    const updated = store.HttpChecks.findById(check._id) as Record<string, unknown>;
    expect(updated.status).toBe("down");
  });
});
