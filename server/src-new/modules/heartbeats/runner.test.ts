import { describe, expect, it } from "vitest";
import type { Store } from "../../store/index.js";
import { initHeartbeatRunner, recordPing, sweepMonitors } from "./runner.js";
import type { Server as SocketIOServer } from "socket.io";
import { EventEmitter } from "events";

function makeStore() {
  const monitors = new Map<string, Record<string, unknown>>();
  return {
    HeartbeatMonitors: {
      findActive: () => Array.from(monitors.values()).filter((m) => m.isActive) as never,
      update: (id: string, u: Record<string, unknown>) => {
        const m = monitors.get(id);
        if (!m) return null;
        Object.assign(m, u);
        return m as never;
      },
      _set: (m: Record<string, unknown> & { _id: string }) => monitors.set(m._id, m),
    },
  } as unknown as Store;
}

function makeIo(): SocketIOServer {
  const bus = new EventEmitter();
  return {
    to: () => ({ emit: (event: string, ...args: unknown[]) => { bus.emit(event, ...args); return true; } }),
    _bus: bus,
  } as unknown as SocketIOServer;
}

describe("Heartbeat sweeper", () => {
  it("flips monitor to down when past deadline and emits event", () => {
    const store = makeStore();
    const io = makeIo();
    initHeartbeatRunner(store, io);
    const oldPing = new Date(Date.now() - 5 * 60_000).toISOString();
    const monitor = {
      _id: "hb1", userId: "u1", name: "nightly", slug: "nightly", isActive: true,
      expectedEverySeconds: 60, gracePeriodSeconds: 10,
      lastPingAt: oldPing, status: "up",
    };
    (store.HeartbeatMonitors as unknown as { _set: (m: Record<string, unknown>) => void })._set(monitor);

    const events: unknown[] = [];
    (io as unknown as { _bus: EventEmitter })._bus.on("heartbeat:missed", (e) => events.push(e));
    sweepMonitors();
    expect(monitor.status).toBe("down");
    expect(events.length).toBe(1);
  });

  it("recordPing updates status and emits ping event", () => {
    const store = makeStore();
    const io = makeIo();
    initHeartbeatRunner(store, io);
    const monitor: Record<string, unknown> & { _id: string; status: string } = {
      _id: "hb2", userId: "u1", name: "cron", slug: "cron", isActive: true,
      expectedEverySeconds: 60, gracePeriodSeconds: 10,
      lastPingAt: null, status: "pending",
    };
    (store.HeartbeatMonitors as unknown as { _set: (m: Record<string, unknown>) => void })._set(monitor);

    const events: unknown[] = [];
    (io as unknown as { _bus: EventEmitter })._bus.on("heartbeat:ping", (e) => events.push(e));
    recordPing(monitor as never);
    expect(monitor.status).toBe("up");
    expect(events.length).toBe(1);
  });
});
