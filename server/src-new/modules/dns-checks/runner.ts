/**
 * DNS check runner — resolves a record via node:dns/promises.Resolver.
 * Supports A, AAAA, CNAME, MX, TXT, NS, SOA.
 *
 * If `expected` is non-empty, all comma-separated tokens must be present in
 * the resolved values for the check to report "up". Empty `expected` means
 * "any successful resolution is up".
 */

import { Resolver } from "node:dns/promises";
import type { Store } from "../../store/index.js";
import type { DnsCheck, DnsCheckResult } from "../../shared/types.js";
import type { Server as SocketIOServer } from "socket.io";
import { emitEvent } from "../events/service.js";

const MAX_RESULTS = 100;
const RESOLVE_TIMEOUT_MS = 5_000;
const intervals = new Map<string, ReturnType<typeof setInterval>>();

let _store: Store;
let _io: SocketIOServer;

export function initDnsRunner(store: Store, io: SocketIOServer): void {
  _store = store;
  _io = io;
}

export function startAllDnsChecks(): void {
  const checks = _store.DnsChecks.findActive();
  for (const check of checks) scheduleDnsCheck(check);
}

export function scheduleDnsCheck(check: { _id: string; interval: number }): void {
  if (intervals.has(check._id)) return;
  void runDnsCheck(check._id);
  const handle = setInterval(() => void runDnsCheck(check._id), check.interval || 300_000);
  intervals.set(check._id, handle);
}

export function unscheduleDnsCheck(checkId: string): void {
  const handle = intervals.get(checkId);
  if (handle) {
    clearInterval(handle);
    intervals.delete(checkId);
  }
}

export function rescheduleDnsCheck(check: DnsCheck): void {
  unscheduleDnsCheck(check._id);
  if (check.isActive) scheduleDnsCheck(check);
}

export async function resolveRecord(domain: string, recordType: DnsCheck["recordType"]): Promise<string[]> {
  const resolver = new Resolver({ timeout: RESOLVE_TIMEOUT_MS, tries: 1 });
  switch (recordType) {
    case "A": return resolver.resolve4(domain);
    case "AAAA": return resolver.resolve6(domain);
    case "CNAME": return resolver.resolveCname(domain);
    case "NS": return resolver.resolveNs(domain);
    case "TXT": {
      const records = await resolver.resolveTxt(domain);
      return records.map((chunks) => chunks.join(""));
    }
    case "MX": {
      const records = await resolver.resolveMx(domain);
      return records.map((r) => `${r.priority} ${r.exchange}`);
    }
    case "SOA": {
      const r = await resolver.resolveSoa(domain);
      return [`${r.nsname} ${r.hostmaster} ${r.serial}`];
    }
    default:
      throw new Error(`Unsupported record type: ${recordType}`);
  }
}

function matchesExpected(values: string[], expected: string): boolean {
  if (!expected.trim()) return true;
  const wanted = expected.split(",").map((s) => s.trim()).filter(Boolean);
  return wanted.every((w) => values.some((v) => v.includes(w)));
}

async function runDnsCheck(checkId: string): Promise<void> {
  const current = _store.DnsChecks.findById(checkId);
  if (!current || !current.isActive) {
    unscheduleDnsCheck(checkId);
    return;
  }

  let status: "up" | "down" = "down";
  let latencyMs = 0;
  let values: string[] = [];
  let error: string | null = null;
  const start = Date.now();

  try {
    values = await resolveRecord(current.domain, current.recordType);
    latencyMs = Date.now() - start;
    status = matchesExpected(values, current.expected) ? "up" : "down";
    if (status === "down") {
      error = `Resolved values do not match expected: [${values.join(", ")}]`;
    }
  } catch (err) {
    latencyMs = Date.now() - start;
    error = (err as Error).message;
    status = "down";
  }

  const result: DnsCheckResult = {
    timestamp: Date.now(),
    status,
    latencyMs,
    values,
    error,
  };

  const results = [...(current.results ?? []), result].slice(-MAX_RESULTS);
  const upCount = results.filter((r) => r.status === "up").length;
  const uptimePercent = results.length ? Math.round((upCount / results.length) * 1000) / 10 : 100;

  const prevStatus = current.status;
  _store.DnsChecks.update(current._id, {
    status,
    lastCheckedAt: new Date().toISOString(),
    lastLatencyMs: latencyMs,
    lastValues: values,
    lastError: error,
    uptimePercent,
    results,
  });

  if (prevStatus !== status) {
    emitEvent(_store, _io, {
      userId: current.userId,
      kind: "dns_check",
      source: "dns-checks",
      severity: status === "down" ? "error" : "info",
      title: `DNS ${status.toUpperCase()}: ${current.name} (${current.domain} ${current.recordType})`,
      detail: { checkId: current._id, status, previousStatus: prevStatus, values, error },
    });
  }

  if (_io) {
    _io.to("all").emit("dnscheck:result", {
      checkId: current._id,
      name: current.name,
      domain: current.domain,
      recordType: current.recordType,
      status,
      latencyMs,
      values,
      uptimePercent,
      error,
      timestamp: result.timestamp,
    });
  }
}
