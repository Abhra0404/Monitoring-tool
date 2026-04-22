/**
 * Hydrate the in-memory store from Postgres on startup.
 *
 * Only relational (non-time-series) tables are hydrated; metrics and docker
 * snapshots are queried on demand from hypertables when needed.
 */

import { sql } from "drizzle-orm";
import type { Db } from "./connection.js";
import { schema } from "./schema.js";
import type store from "../store/index.js";
import type {
  SystemUser,
  ServerRecord,
  AlertRule,
  AlertHistoryEntry,
  HttpCheck,
  HttpCheckResult,
  PipelineRecord,
  NotificationChannel,
  StatusPageConfig,
  RefreshTokenRecord,
  TcpCheck,
  TcpCheckResult,
  PingCheck,
  PingCheckResult,
  DnsCheck,
  DnsCheckResult,
  HeartbeatMonitor,
  EventRecord,
  EventKind,
  EventSeverity,
  IncidentRecord,
  IncidentUpdateRecord,
  IncidentStatus,
  IncidentSeverity,
} from "../shared/types.js";

type Store = typeof store;

function rowToUser(row: typeof schema.users.$inferSelect): SystemUser {
  return {
    _id: row.id,
    email: row.email,
    password: row.passwordHash,
    apiKey: row.apiKey,
    role: (row.role === "admin" ? "admin" : "user") as SystemUser["role"],
    isSystem: row.isSystem,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToRefreshToken(
  row: typeof schema.refreshTokens.$inferSelect,
): RefreshTokenRecord {
  return {
    _id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function rowToServer(row: typeof schema.servers.$inferSelect): ServerRecord {
  return {
    _id: row.id,
    userId: row.userId,
    serverId: row.serverId,
    name: row.name,
    status: row.status as ServerRecord["status"],
    lastSeen: row.lastSeen?.toISOString() ?? new Date(0).toISOString(),
    cpuCount: row.cpuCount ?? undefined,
    platform: row.platform ?? undefined,
    arch: row.arch ?? undefined,
    hostname: row.hostname ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToAlertRule(row: typeof schema.alertRules.$inferSelect): AlertRule {
  return {
    _id: row.id,
    userId: row.userId,
    name: row.name,
    metricName: row.metricName,
    labels: row.labels ?? {},
    operator: row.operator,
    threshold: row.threshold,
    durationMinutes: row.durationMinutes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToAlertHistory(row: typeof schema.alertHistory.$inferSelect): AlertHistoryEntry {
  return {
    _id: row.id,
    userId: row.userId,
    ruleId: row.ruleId,
    ruleName: row.ruleName,
    metricName: row.metricName,
    labels: row.labels ?? {},
    operator: row.operator,
    threshold: row.threshold,
    actualValue: row.actualValue,
    severity: row.severity as AlertHistoryEntry["severity"],
    status: row.status as AlertHistoryEntry["status"],
    message: row.message ?? "",
    firedAt: row.firedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString(),
    createdAt: row.firedAt.toISOString(),
  };
}

function rowToHttpCheck(
  row: typeof schema.httpChecks.$inferSelect,
): HttpCheck & { results: HttpCheckResult[] } {
  return {
    _id: row.id,
    userId: row.userId,
    name: row.name,
    url: row.url,
    interval: row.intervalSeconds * 1000,
    expectedStatus: row.expectedStatus,
    isActive: row.isActive,
    status: row.status,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastResponseTime: row.lastResponseTime,
    lastStatusCode: row.lastStatusCode,
    sslExpiry: row.sslExpiry ? Math.ceil((row.sslExpiry.getTime() - Date.now()) / 86_400_000) : null,
    uptimePercent: row.uptimePercent,
    results: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToPipeline(row: typeof schema.pipelines.$inferSelect): PipelineRecord {
  return {
    _id: row.id,
    userId: row.userId,
    source: row.source,
    repo: row.repo,
    branch: row.branch ?? "",
    pipelineName: row.pipelineName ?? "",
    runId: row.runId,
    runNumber: row.runNumber ?? 0,
    status: row.status,
    triggeredBy: row.triggeredBy ?? "",
    commitSha: row.commitSha ?? "",
    commitMessage: row.commitMessage ?? "",
    url: row.url ?? "",
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    duration: row.durationMs ?? undefined,
    stages: row.stages ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToChannel(
  row: typeof schema.notificationChannels.$inferSelect,
): NotificationChannel {
  return {
    _id: row.id,
    userId: row.userId,
    type: row.type,
    name: row.name,
    config: row.config ?? {},
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToStatusPage(
  row: typeof schema.statusPageConfig.$inferSelect,
): StatusPageConfig {
  return {
    userId: row.userId,
    title: row.title,
    description: row.description,
    isPublic: row.isPublic,
    customServices: row.customServices ?? [],
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToTcpCheck(
  row: typeof schema.tcpChecks.$inferSelect,
): TcpCheck & { results: TcpCheckResult[] } {
  return {
    _id: row.id,
    userId: row.userId,
    name: row.name,
    host: row.host,
    port: row.port,
    interval: row.intervalSeconds * 1000,
    timeoutMs: row.timeoutMs,
    isActive: row.isActive,
    status: row.status as TcpCheck["status"],
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastLatencyMs: null,
    lastError: null,
    uptimePercent: 100,
    results: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.createdAt.toISOString(),
  };
}

function rowToPingCheck(
  row: typeof schema.pingChecks.$inferSelect,
): PingCheck & { results: PingCheckResult[] } {
  return {
    _id: row.id,
    userId: row.userId,
    name: row.name,
    host: row.host,
    interval: row.intervalSeconds * 1000,
    isActive: row.isActive,
    status: row.status as PingCheck["status"],
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastLatencyMs: row.lastLatencyMs ?? null,
    lastPacketLoss: row.lastPacketLoss ?? null,
    lastError: null,
    uptimePercent: 100,
    results: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.createdAt.toISOString(),
  };
}

function rowToDnsCheck(
  row: typeof schema.dnsChecks.$inferSelect,
): DnsCheck & { results: DnsCheckResult[] } {
  return {
    _id: row.id,
    userId: row.userId,
    name: row.name,
    domain: row.domain,
    recordType: row.recordType as DnsCheck["recordType"],
    expected: row.expected ?? "",
    interval: row.intervalSeconds * 1000,
    isActive: row.isActive,
    status: row.status as DnsCheck["status"],
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastLatencyMs: null,
    lastValues: [],
    lastError: null,
    uptimePercent: 100,
    results: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.createdAt.toISOString(),
  };
}

function rowToHeartbeat(
  row: typeof schema.heartbeatMonitors.$inferSelect,
): HeartbeatMonitor {
  return {
    _id: row.id,
    userId: row.userId,
    name: row.name,
    slug: row.slug,
    expectedEverySeconds: row.expectedEverySeconds,
    gracePeriodSeconds: row.gracePeriodSeconds,
    lastPingAt: row.lastPingAt?.toISOString() ?? null,
    status: row.status as HeartbeatMonitor["status"],
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.createdAt.toISOString(),
  };
}

function rowToEvent(row: typeof schema.events.$inferSelect): EventRecord {
  return {
    _id: row.id,
    userId: row.userId,
    time: row.time.getTime(),
    kind: row.kind as EventKind,
    source: row.source,
    severity: row.severity as EventSeverity,
    title: row.title,
    detail: row.detail ?? {},
  };
}

function rowToIncident(row: typeof schema.incidents.$inferSelect): IncidentRecord {
  return {
    _id: row.id,
    userId: row.userId,
    title: row.title,
    status: row.status as IncidentStatus,
    severity: row.severity as IncidentSeverity,
    services: row.services ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

function rowToIncidentUpdate(
  row: typeof schema.incidentUpdates.$inferSelect,
): IncidentUpdateRecord {
  return {
    _id: row.id,
    incidentId: row.incidentId,
    status: row.status as IncidentStatus,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function hydrateStoreFromDb(db: Db, memStore: Store): Promise<void> {
  // Ensure system user exists in DB — seed it with the in-memory system user's
  // API key so agents already configured keep working.
  const sys = memStore.systemUser;
  await db
    .insert(schema.users)
    .values({
      id: sys._id.length === 36 ? sys._id : undefined, // UUID only
      email: sys.email,
      passwordHash: sys.password || "unset",
      apiKey: sys.apiKey,
      role: "admin",
      isSystem: true,
    })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: { apiKey: sql`EXCLUDED.api_key`, updatedAt: new Date() },
    })
    .catch(() => {
      /* unique violation on id is fine — we'll fall back to email upsert below */
    });

  // Reconcile the in-memory system user's id with DB record (in case DB generated a uuid).
  const dbSys = await db
    .select()
    .from(schema.users)
    .where(sql`${schema.users.email} = ${sys.email}`);
  if (dbSys.length > 0) {
    sys._id = dbSys[0].id;
  }

  // Load all users, servers, rules, history, http checks, pipelines, channels, status page config.
  const [
    userRows,
    serverRows,
    ruleRows,
    historyRows,
    checkRows,
    pipelineRows,
    channelRows,
    statusRows,
    refreshTokenRows,
    tcpRows,
    pingRows,
    dnsRows,
    heartbeatRows,
    incidentRows,
    incidentUpdateRows,
    eventRows,
  ] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.servers),
    db.select().from(schema.alertRules),
    db.select().from(schema.alertHistory),
    db.select().from(schema.httpChecks),
    db.select().from(schema.pipelines),
    db.select().from(schema.notificationChannels),
    db.select().from(schema.statusPageConfig),
    db.select().from(schema.refreshTokens),
    db.select().from(schema.tcpChecks),
    db.select().from(schema.pingChecks),
    db.select().from(schema.dnsChecks),
    db.select().from(schema.heartbeatMonitors),
    db.select().from(schema.incidents),
    db.select().from(schema.incidentUpdates),
    // Hydrate only the most recent events (last 7 days, cap 10k) — the full
    // history stays in Timescale and is queried on demand.
    db
      .select()
      .from(schema.events)
      .where(sql`${schema.events.time} > NOW() - INTERVAL '7 days'`)
      .orderBy(sql`${schema.events.time} DESC`)
      .limit(10_000),
  ]);

  memStore.Users.replaceAll(userRows.map(rowToUser));
  memStore.Servers.replaceAll(serverRows.map(rowToServer));
  memStore.AlertRules.replaceAll(ruleRows.map(rowToAlertRule));
  memStore.AlertHistory.replaceAll(historyRows.map(rowToAlertHistory));
  memStore.HttpChecks.replaceAll(checkRows.map(rowToHttpCheck));
  memStore.Pipelines.replaceAll(pipelineRows.map(rowToPipeline));
  memStore.NotificationChannels.replaceAll(channelRows.map(rowToChannel));
  memStore.StatusPageConfig.replaceAll(statusRows[0] ? rowToStatusPage(statusRows[0]) : null);
  memStore.RefreshTokens.replaceAll(refreshTokenRows.map(rowToRefreshToken));
  memStore.TcpChecks.replaceAll(tcpRows.map(rowToTcpCheck));
  memStore.PingChecks.replaceAll(pingRows.map(rowToPingCheck));
  memStore.DnsChecks.replaceAll(dnsRows.map(rowToDnsCheck));
  memStore.HeartbeatMonitors.replaceAll(heartbeatRows.map(rowToHeartbeat));
  memStore.Incidents.replaceAll(incidentRows.map(rowToIncident));
  memStore.IncidentUpdates.replaceAll(incidentUpdateRows.map(rowToIncidentUpdate));
  memStore.Events.replaceAll(eventRows.map(rowToEvent).sort((a, b) => a.time - b.time));
}
