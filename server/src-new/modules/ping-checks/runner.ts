/**
 * Ping check runner — shells the system `ping` binary so ICMP permissions
 * aren't required on the Node process. Parses latency + packet loss
 * from the output on Linux, macOS, and Windows.
 *
 * Containerised environments that block ICMP will report "down" — that is
 * the correct semantics: from the monitor's vantage point, the host is not
 * reachable via ICMP.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Store } from "../../store/index.js";
import type { PingCheck, PingCheckResult } from "../../shared/types.js";
import type { Server as SocketIOServer } from "socket.io";
import { emitEvent } from "../events/service.js";

const execFileAsync = promisify(execFile);
const MAX_RESULTS = 100;
const intervals = new Map<string, ReturnType<typeof setInterval>>();
const PACKET_COUNT = 3;

let _store: Store;
let _io: SocketIOServer;

export function initPingRunner(store: Store, io: SocketIOServer): void {
  _store = store;
  _io = io;
}

export function startAllPingChecks(): void {
  const checks = _store.PingChecks.findActive();
  for (const check of checks) schedulePingCheck(check);
}

export function schedulePingCheck(check: { _id: string; interval: number }): void {
  if (intervals.has(check._id)) return;
  void runPingCheck(check._id);
  const handle = setInterval(() => void runPingCheck(check._id), check.interval || 60_000);
  intervals.set(check._id, handle);
}

export function unschedulePingCheck(checkId: string): void {
  const handle = intervals.get(checkId);
  if (handle) {
    clearInterval(handle);
    intervals.delete(checkId);
  }
}

export function reschedulePingCheck(check: PingCheck): void {
  unschedulePingCheck(check._id);
  if (check.isActive) schedulePingCheck(check);
}

/** Only allow hostnames/IPs — no spaces, shell metacharacters, or flags. */
function validateHost(host: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(host) && host.length > 0 && host.length <= 253;
}

function pingArgs(host: string): { cmd: string; args: string[] } {
  if (process.platform === "win32") {
    return { cmd: "ping", args: ["-n", String(PACKET_COUNT), "-w", "3000", host] };
  }
  // Linux & macOS both accept -c <count> -W <timeoutSec on linux / ms on mac>
  const timeoutArg = process.platform === "darwin" ? ["-W", "3000"] : ["-W", "3"];
  return { cmd: "ping", args: ["-c", String(PACKET_COUNT), ...timeoutArg, host] };
}

interface PingStats {
  avgMs: number;
  packetLoss: number;
}

export function parsePingOutput(output: string): PingStats | null {
  // Windows: "Average = 12ms"  and  "Lost = 0 (0% loss)"
  const avgWin = /Average\s*=\s*(\d+(?:\.\d+)?)\s*ms/i.exec(output);
  const lossWin = /\((\d+)%\s*loss\)/i.exec(output);
  if (avgWin && lossWin) {
    return { avgMs: Number(avgWin[1]), packetLoss: Number(lossWin[1]) };
  }
  // Linux: "rtt min/avg/max/mdev = 0.5/0.6/0.8/0.1 ms" + "3 packets transmitted, 3 received, 0% packet loss"
  // macOS: "round-trip min/avg/max/stddev = 0.5/0.6/0.8/0.1 ms"
  const avgUnix = /(?:min\/avg\/max\/(?:mdev|stddev))\s*=\s*[\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+\s*ms/i.exec(output);
  const lossUnix = /([\d.]+)%\s*packet\s*loss/i.exec(output);
  if (avgUnix && lossUnix) {
    return { avgMs: Number(avgUnix[1]), packetLoss: Number(lossUnix[1]) };
  }
  return null;
}

async function runPingCheck(checkId: string): Promise<void> {
  const current = _store.PingChecks.findById(checkId);
  if (!current || !current.isActive) {
    unschedulePingCheck(checkId);
    return;
  }

  let status: "up" | "down" = "down";
  let latencyMs = 0;
  let packetLoss = 100;
  let error: string | null = null;

  if (!validateHost(current.host)) {
    error = "Invalid host";
  } else {
    const { cmd, args } = pingArgs(current.host);
    try {
      const { stdout } = await execFileAsync(cmd, args, { timeout: 15_000, windowsHide: true });
      const stats = parsePingOutput(stdout);
      if (stats) {
        latencyMs = stats.avgMs;
        packetLoss = stats.packetLoss;
        status = stats.packetLoss < 100 ? "up" : "down";
      } else {
        error = "Could not parse ping output";
      }
    } catch (err) {
      // Non-zero exit (host unreachable) is expected for down hosts; don't spam logs.
      const msg = (err as Error).message;
      const parsed = parsePingOutput(msg);
      if (parsed) {
        latencyMs = parsed.avgMs;
        packetLoss = parsed.packetLoss;
      }
      status = "down";
      error = "Host unreachable";
    }
  }

  const result: PingCheckResult = {
    timestamp: Date.now(),
    status,
    latencyMs,
    packetLoss,
    error,
  };

  const results = [...(current.results ?? []), result].slice(-MAX_RESULTS);
  const upCount = results.filter((r) => r.status === "up").length;
  const uptimePercent = results.length ? Math.round((upCount / results.length) * 1000) / 10 : 100;

  const prevStatus = current.status;
  _store.PingChecks.update(current._id, {
    status,
    lastCheckedAt: new Date().toISOString(),
    lastLatencyMs: status === "up" ? latencyMs : null,
    lastPacketLoss: packetLoss,
    lastError: error,
    uptimePercent,
    results,
  });

  if (prevStatus !== status) {
    emitEvent(_store, _io, {
      userId: current.userId,
      kind: "ping_check",
      source: "ping-checks",
      severity: status === "down" ? "error" : "info",
      title: `Ping ${status.toUpperCase()}: ${current.name} (${current.host})`,
      detail: { checkId: current._id, status, previousStatus: prevStatus, latencyMs, packetLoss, error },
    });
  }

  if (_io) {
    _io.to("all").emit("pingcheck:result", {
      checkId: current._id,
      name: current.name,
      host: current.host,
      status,
      latencyMs,
      packetLoss,
      uptimePercent,
      error,
      timestamp: result.timestamp,
    });
  }
}
