/**
 * Server reachability checker.
 *
 * Emits a synthetic `server_unreachable` metric (0 or 1) to the alert
 * engine for each registered server every 30s. A server is considered
 * unreachable if its `lastSeen` timestamp is older than the grace period
 * (default 2 minutes). This drives the built-in "Default: Server
 * unreachable" alert that is seeded on first contact.
 */

import type { Store } from "../../store/index.js";
import type { Server as SocketIOServer } from "socket.io";
import { evaluateAlerts } from "../alerts/engine.js";
import { dispatchAlert } from "../notifications/service.js";
import { emitEvent } from "../events/service.js";

const SWEEP_INTERVAL_MS = 30_000;
const UNREACHABLE_AFTER_MS = 2 * 60_000;

let sweepHandle: ReturnType<typeof setInterval> | null = null;

export function startReachabilityChecker(store: Store, io: SocketIOServer): void {
  if (sweepHandle) return;
  sweepHandle = setInterval(() => sweepOnce(store, io), SWEEP_INTERVAL_MS);
}

export function stopReachabilityChecker(): void {
  if (sweepHandle) {
    clearInterval(sweepHandle);
    sweepHandle = null;
  }
}

export function sweepOnce(store: Store, io: SocketIOServer): void {
  const now = Date.now();
  // Group servers by user so evaluateAlerts is called once per (user, host)
  for (const user of store.Users.listAll ? store.Users.listAll() : []) {
    const servers = store.Servers.find(user._id);
    for (const server of servers) {
      const last = new Date(server.lastSeen).getTime();
      const unreachable = now - last > UNREACHABLE_AFTER_MS ? 1 : 0;
      const metrics = {
        server_unreachable: { value: unreachable, labels: { host: server.serverId } },
      };
      const fired = evaluateAlerts(store, user._id, metrics, (alert) => {
        io.to("all").emit("alert:resolved", alert);
        dispatchAlert(store, user._id, alert as unknown as Record<string, unknown>, "resolved").catch(() => {});
      });
      for (const alert of fired) {
        io.to("all").emit("alert:fired", alert);
        dispatchAlert(store, user._id, alert as unknown as Record<string, unknown>, "fired").catch(() => {});
      }
      // Also flip status on the server record so the UI reflects it promptly.
      if (unreachable && server.status !== "offline") {
        store.Servers.update(user._id, server.serverId, { status: "offline" });
        emitEvent(store, io, {
          userId: user._id,
          kind: "server_offline",
          source: "agent",
          severity: "error",
          title: `Server offline: ${server.name || server.serverId}`,
          detail: { serverId: server.serverId, lastSeen: server.lastSeen },
        });
      }
    }
  }
}
