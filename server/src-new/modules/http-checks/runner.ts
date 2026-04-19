/**
 * HTTP check runner — schedules and executes HTTP health checks.
 */

import http from "http";
import https from "https";
import { URL } from "url";
import type { Store } from "../../store/index.js";
import type { HttpCheckResult } from "../../shared/types.js";
import { evaluateAlerts } from "../alerts/engine.js";
import { dispatchAlert } from "../notifications/service.js";
import type { Server as SocketIOServer } from "socket.io";

const MAX_RESULTS = 100;
const REQUEST_TIMEOUT = 10_000;
const intervals = new Map<string, ReturnType<typeof setInterval>>();

let _store: Store;
let _io: SocketIOServer;

export function initRunner(store: Store, io: SocketIOServer): void {
  _store = store;
  _io = io;
}

export function startAll(): void {
  const checks = _store.HttpChecks.findActive();
  for (const check of checks) {
    scheduleCheck(check);
  }
  if (checks.length > 0) {
    console.log(`HTTP check runner: scheduled ${checks.length} active checks`);
  }
}

export function scheduleCheck(check: { _id: string; interval?: number }): void {
  if (intervals.has(check._id)) return;
  runCheck(check._id);
  const handle = setInterval(() => runCheck(check._id), (check as { interval: number }).interval || 60_000);
  intervals.set(check._id, handle);
}

export function unscheduleCheck(checkId: string): void {
  const handle = intervals.get(checkId);
  if (handle) {
    clearInterval(handle);
    intervals.delete(checkId);
  }
}

export function rescheduleCheck(check: { _id: string; isActive: boolean; interval?: number }): void {
  unscheduleCheck(check._id);
  if (check.isActive) {
    scheduleCheck(check);
  }
}

async function runCheck(checkId: string): Promise<void> {
  const current = _store.HttpChecks.findById(checkId);
  if (!current || !current.isActive) {
    unscheduleCheck(checkId);
    return;
  }

  let statusCode: number | null = null;
  let responseTime = 0;
  let sslDaysRemaining: number | null = null;
  let error: string | null = null;
  let status: "up" | "down" = "down";

  try {
    const result = await makeRequest(current.url);
    statusCode = result.statusCode;
    responseTime = result.responseTime;
    sslDaysRemaining = result.sslDaysRemaining;
    status = statusCode === (current.expectedStatus || 200) ? "up" : "down";
  } catch (err: unknown) {
    error = (err as Error).message || "Request failed";
    status = "down";
  }

  const resultEntry: HttpCheckResult = {
    timestamp: Date.now(),
    statusCode,
    responseTime,
    status,
    sslDaysRemaining,
    error,
  };

  const results = [...(current.results || []), resultEntry].slice(-MAX_RESULTS);
  const upCount = results.filter((r) => r.status === "up").length;
  const uptimePercent = results.length > 0 ? Math.round((upCount / results.length) * 1000) / 10 : 100;

  _store.HttpChecks.update(current._id, {
    status,
    lastCheckedAt: new Date().toISOString(),
    lastResponseTime: responseTime,
    lastStatusCode: statusCode,
    sslExpiry: sslDaysRemaining,
    uptimePercent,
    results,
  });

  if (_io) {
    _io.to("all").emit("httpcheck:result", {
      checkId: current._id,
      name: current.name,
      url: current.url,
      status,
      statusCode,
      responseTime,
      sslDaysRemaining,
      uptimePercent,
      error,
      timestamp: resultEntry.timestamp,
    });
  }

  // Feed synthetic metric into alert engine
  const metricsMap = {
    httpcheck_status: {
      value: status === "up" ? 1 : 0,
      labels: { url: current.url, name: current.name },
    },
  };

  try {
    const firedAlerts = evaluateAlerts(_store, current.userId, metricsMap);
    if (_io) {
      for (const alert of firedAlerts) {
        _io.to("all").emit("alert:fired", alert);
        dispatchAlert(_store, current.userId, alert as unknown as Record<string, unknown>, "fired").catch((err: unknown) =>
          console.error("HTTP check alert notification error:", (err as Error).message),
        );
      }
    }
  } catch (err: unknown) {
    console.error("HTTP check alert evaluation error:", (err as Error).message);
  }
}

function makeRequest(urlStr: string): Promise<{ statusCode: number; responseTime: number; sslDaysRemaining: number | null }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return reject(new Error("Invalid URL"));
    }

    const isHttps = parsed.protocol === "https:";
    const client = isHttps ? https : http;
    const startTime = Date.now();

    const options = {
      timeout: REQUEST_TIMEOUT,
      rejectUnauthorized: false,
      headers: { "User-Agent": "Theoria/1.0" },
    };

    const req = client.get(parsed.href, options, (res) => {
      const responseTime = Date.now() - startTime;
      let sslDaysRemaining: number | null = null;

      if (isHttps && res.socket && "getPeerCertificate" in res.socket) {
        try {
          const cert = (res.socket as import("tls").TLSSocket).getPeerCertificate();
          if (cert && cert.valid_to) {
            const expiryDate = new Date(cert.valid_to);
            sslDaysRemaining = Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000);
          }
        } catch { /* ignore cert parsing errors */ }
      }

      res.resume();
      res.on("end", () => {
        resolve({ statusCode: res.statusCode ?? 0, responseTime, sslDaysRemaining });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    req.on("error", (err: NodeJS.ErrnoException) => {
      reject(new Error(err.code === "ENOTFOUND" ? "DNS lookup failed" : err.message));
    });
  });
}
