/**
 * Heartbeat/cron monitor runner.
 *
 * A heartbeat monitor is declared by slug. Any job can keep it alive via a
 * public POST /api/heartbeat/:slug. A background sweep checks every 15s for
 * monitors whose `lastPingAt` is older than `expectedEverySeconds +
 * gracePeriodSeconds` and flips them to "down", emitting a firing alert.
 */

import type { Store } from "../../store/index.js";
import type { HeartbeatMonitor } from "../../shared/types.js";
import type { Server as SocketIOServer } from "socket.io";
import { emitEvent } from "../events/service.js";

const SWEEP_INTERVAL_MS = 15_000;
let _store: Store;
let _io: SocketIOServer;
let sweepHandle: ReturnType<typeof setInterval> | null = null;
// Tracks which monitors are currently reported as "down" so we only emit one
// alert per outage.
const downMonitors = new Set<string>();

export function initHeartbeatRunner(store: Store, io: SocketIOServer): void {
  _store = store;
  _io = io;
}

export function startHeartbeatSweeper(): void {
  if (sweepHandle) return;
  sweepHandle = setInterval(sweepMonitors, SWEEP_INTERVAL_MS);
}

export function stopHeartbeatSweeper(): void {
  if (sweepHandle) {
    clearInterval(sweepHandle);
    sweepHandle = null;
  }
}

export function recordPing(monitor: HeartbeatMonitor): HeartbeatMonitor {
  const wasDown = downMonitors.has(monitor._id);
  const updated = _store.HeartbeatMonitors.update(monitor._id, {
    lastPingAt: new Date().toISOString(),
    status: "up",
  }) ?? monitor;
  if (wasDown) {
    downMonitors.delete(monitor._id);
    if (_io) {
      _io.to("all").emit("heartbeat:recovered", {
        monitorId: updated._id,
        name: updated.name,
        slug: updated.slug,
        timestamp: Date.now(),
      });
    }
    emitEvent(_store, _io, {
      userId: updated.userId,
      kind: "heartbeat_recovered",
      source: "heartbeats",
      severity: "info",
      title: `Heartbeat recovered: ${updated.name}`,
      detail: { monitorId: updated._id, slug: updated.slug },
    });
  }
  if (_io) {
    _io.to("all").emit("heartbeat:ping", {
      monitorId: updated._id,
      name: updated.name,
      slug: updated.slug,
      timestamp: Date.now(),
    });
  }
  return updated;
}

export function sweepMonitors(): void {
  if (!_store) return;
  const now = Date.now();
  const monitors = _store.HeartbeatMonitors.findActive();
  for (const monitor of monitors) {
    if (!monitor.lastPingAt) continue; // never pinged — remain "pending"
    const last = new Date(monitor.lastPingAt).getTime();
    const deadline = last + (monitor.expectedEverySeconds + monitor.gracePeriodSeconds) * 1000;
    if (now > deadline && !downMonitors.has(monitor._id)) {
      downMonitors.add(monitor._id);
      _store.HeartbeatMonitors.update(monitor._id, { status: "down" });
      if (_io) {
        _io.to("all").emit("heartbeat:missed", {
          monitorId: monitor._id,
          name: monitor.name,
          slug: monitor.slug,
          lastPingAt: monitor.lastPingAt,
          timestamp: now,
        });
      }
      emitEvent(_store, _io, {
        userId: monitor.userId,
        kind: "heartbeat_missed",
        source: "heartbeats",
        severity: "error",
        title: `Heartbeat missed: ${monitor.name}`,
        detail: {
          monitorId: monitor._id,
          slug: monitor.slug,
          lastPingAt: monitor.lastPingAt,
          expectedEverySeconds: monitor.expectedEverySeconds,
        },
      });
    }
  }
}
