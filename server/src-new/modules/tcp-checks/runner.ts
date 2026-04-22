/**
 * TCP check runner — verifies that a TCP port accepts connections.
 * Uses raw net.Socket, no shelled subprocess.
 */

import net from "node:net";
import type { Store } from "../../store/index.js";
import type { TcpCheck, TcpCheckResult } from "../../shared/types.js";
import type { Server as SocketIOServer } from "socket.io";
import { emitEvent } from "../events/service.js";

const MAX_RESULTS = 100;
const intervals = new Map<string, ReturnType<typeof setInterval>>();

let _store: Store;
let _io: SocketIOServer;

export function initTcpRunner(store: Store, io: SocketIOServer): void {
  _store = store;
  _io = io;
}

export function startAllTcpChecks(): void {
  const checks = _store.TcpChecks.findActive();
  for (const check of checks) scheduleTcpCheck(check);
}

export function scheduleTcpCheck(check: { _id: string; interval: number }): void {
  if (intervals.has(check._id)) return;
  void runTcpCheck(check._id);
  const handle = setInterval(() => void runTcpCheck(check._id), check.interval || 60_000);
  intervals.set(check._id, handle);
}

export function unscheduleTcpCheck(checkId: string): void {
  const handle = intervals.get(checkId);
  if (handle) {
    clearInterval(handle);
    intervals.delete(checkId);
  }
}

export function rescheduleTcpCheck(check: TcpCheck): void {
  unscheduleTcpCheck(check._id);
  if (check.isActive) scheduleTcpCheck(check);
}

function attemptConnection(host: string, port: number, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(Date.now() - start);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done());
    socket.once("timeout", () => done(new Error("Connection timed out")));
    socket.once("error", (err) => done(err as Error));
    try {
      socket.connect(port, host);
    } catch (err) {
      done(err as Error);
    }
  });
}

async function runTcpCheck(checkId: string): Promise<void> {
  const current = _store.TcpChecks.findById(checkId);
  if (!current || !current.isActive) {
    unscheduleTcpCheck(checkId);
    return;
  }

  let status: "up" | "down" = "down";
  let latencyMs = 0;
  let error: string | null = null;

  try {
    latencyMs = await attemptConnection(current.host, current.port, current.timeoutMs || 5_000);
    status = "up";
  } catch (err) {
    error = (err as Error).message;
    status = "down";
  }

  const result: TcpCheckResult = {
    timestamp: Date.now(),
    status,
    latencyMs,
    error,
  };

  const results = [...(current.results ?? []), result].slice(-MAX_RESULTS);
  const upCount = results.filter((r) => r.status === "up").length;
  const uptimePercent = results.length ? Math.round((upCount / results.length) * 1000) / 10 : 100;

  const prevStatus = current.status;
  _store.TcpChecks.update(current._id, {
    status,
    lastCheckedAt: new Date().toISOString(),
    lastLatencyMs: status === "up" ? latencyMs : null,
    lastError: error,
    uptimePercent,
    results,
  });

  if (prevStatus !== status) {
    emitEvent(_store, _io, {
      userId: current.userId,
      kind: "tcp_check",
      source: "tcp-checks",
      severity: status === "down" ? "error" : "info",
      title: `TCP check ${status.toUpperCase()}: ${current.name} (${current.host}:${current.port})`,
      detail: { checkId: current._id, status, previousStatus: prevStatus, latencyMs, error },
    });
  }

  if (_io) {
    _io.to("all").emit("tcpcheck:result", {
      checkId: current._id,
      name: current.name,
      host: current.host,
      port: current.port,
      status,
      latencyMs,
      uptimePercent,
      error,
      timestamp: result.timestamp,
    });
  }
}
