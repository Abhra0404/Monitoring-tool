/**
 * Postgres write-through persistence.
 *
 * Subscribes to the in-memory store's mutation bus and mirrors changes to
 * the database. Writes are:
 *   - Batched per tick (microtask flush) to amortize round-trips.
 *   - Fire-and-forget (logged on failure) so the hot path never blocks.
 *   - Time-series inserts go directly into hypertables.
 */

import { sql } from "drizzle-orm";
import type { Db } from "./connection.js";
import { schema } from "./schema.js";
import { subscribe, type MutationEvent } from "../store/bus.js";
import type {
  SystemUser,
  ServerRecord,
  MetricRecord,
  AlertRule,
  AlertHistoryEntry,
  HttpCheck,
  HttpCheckResult,
  PipelineRecord,
  NotificationChannel,
  DockerContainer,
  StatusPageConfig,
  RefreshTokenRecord,
  TcpCheck,
  PingCheck,
  DnsCheck,
  HeartbeatMonitor,
  EventRecord,
  IncidentRecord,
  IncidentUpdateRecord,
} from "../shared/types.js";
import type { FastifyBaseLogger } from "fastify";

interface PersistDeps {
  db: Db;
  log: FastifyBaseLogger;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return new Date(value);
}

// ── Write handlers ────────────────────────────────────────────────────────

async function writeUser(db: Db, u: SystemUser): Promise<void> {
  await db
    .insert(schema.users)
    .values({
      id: u._id,
      email: u.email,
      passwordHash: u.password || "unset",
      apiKey: u.apiKey,
      isSystem: u.isSystem,
      role: u.role,
    })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: {
        email: u.email,
        passwordHash: u.password || "unset",
        apiKey: u.apiKey,
        role: u.role,
        isSystem: u.isSystem,
        updatedAt: new Date(),
      },
    });
}

async function writeRefreshToken(db: Db, t: RefreshTokenRecord): Promise<void> {
  await db
    .insert(schema.refreshTokens)
    .values({
      id: t._id,
      userId: t.userId,
      tokenHash: t.tokenHash,
      expiresAt: new Date(t.expiresAt),
      revokedAt: t.revokedAt ? new Date(t.revokedAt) : null,
    })
    .onConflictDoUpdate({
      target: schema.refreshTokens.id,
      set: {
        revokedAt: t.revokedAt ? new Date(t.revokedAt) : null,
      },
    });
}

async function writeServer(db: Db, s: ServerRecord): Promise<void> {
  await db
    .insert(schema.servers)
    .values({
      id: s._id,
      userId: s.userId,
      serverId: s.serverId,
      name: s.name,
      hostname: s.hostname,
      platform: s.platform,
      arch: s.arch,
      cpuCount: s.cpuCount,
      status: s.status,
      lastSeen: toDate(s.lastSeen),
    })
    .onConflictDoUpdate({
      target: [schema.servers.userId, schema.servers.serverId],
      set: {
        name: s.name,
        hostname: s.hostname,
        platform: s.platform,
        arch: s.arch,
        cpuCount: s.cpuCount,
        status: s.status,
        lastSeen: toDate(s.lastSeen),
        updatedAt: new Date(),
      },
    });
}

async function deleteServer(db: Db, scope: Record<string, string>): Promise<void> {
  await db
    .delete(schema.servers)
    .where(
      sql`${schema.servers.userId} = ${scope.userId} AND ${schema.servers.serverId} = ${scope.serverId}`,
    );
}

async function writeMetrics(db: Db, records: MetricRecord[]): Promise<void> {
  if (records.length === 0) return;
  const rows = records.map((m) => ({
    time: new Date(m.timestamp),
    userId: m.userId,
    serverId: m.labels?.host ?? "",
    name: m.name,
    value: m.value,
    labels: m.labels ?? {},
  }));
  await db.insert(schema.metrics).values(rows);
}

async function writeAlertRule(db: Db, r: AlertRule): Promise<void> {
  await db
    .insert(schema.alertRules)
    .values({
      id: r._id,
      userId: r.userId,
      name: r.name,
      metricName: r.metricName,
      labels: r.labels ?? {},
      operator: r.operator,
      threshold: r.threshold,
      durationMinutes: r.durationMinutes,
      isActive: r.isActive,
    })
    .onConflictDoUpdate({
      target: schema.alertRules.id,
      set: {
        name: r.name,
        metricName: r.metricName,
        labels: r.labels ?? {},
        operator: r.operator,
        threshold: r.threshold,
        durationMinutes: r.durationMinutes,
        isActive: r.isActive,
        updatedAt: new Date(),
      },
    });
}

async function deleteAlertRule(db: Db, r: AlertRule): Promise<void> {
  await db.delete(schema.alertRules).where(sql`${schema.alertRules.id} = ${r._id}`);
}

async function writeAlertHistory(db: Db, a: AlertHistoryEntry): Promise<void> {
  await db
    .insert(schema.alertHistory)
    .values({
      id: a._id,
      userId: a.userId,
      ruleId: a.ruleId,
      ruleName: a.ruleName,
      metricName: a.metricName,
      labels: a.labels ?? {},
      operator: a.operator,
      threshold: a.threshold,
      actualValue: a.actualValue,
      severity: a.severity,
      status: a.status,
      message: a.message,
      firedAt: toDate(a.firedAt) ?? new Date(),
      resolvedAt: toDate(a.resolvedAt ?? null),
    })
    .onConflictDoUpdate({
      target: schema.alertHistory.id,
      set: {
        status: a.status,
        resolvedAt: toDate(a.resolvedAt ?? null),
      },
    });
}

async function writeHttpCheck(db: Db, c: HttpCheck): Promise<void> {
  await db
    .insert(schema.httpChecks)
    .values({
      id: c._id,
      userId: c.userId,
      name: c.name,
      url: c.url,
      intervalSeconds: Math.max(5, Math.floor((c.interval ?? 60_000) / 1000)),
      expectedStatus: c.expectedStatus ?? 200,
      isActive: c.isActive,
      status: c.status,
      lastCheckedAt: toDate(c.lastCheckedAt),
      lastResponseTime: c.lastResponseTime,
      lastStatusCode: c.lastStatusCode,
      uptimePercent: c.uptimePercent,
    })
    .onConflictDoUpdate({
      target: schema.httpChecks.id,
      set: {
        name: c.name,
        url: c.url,
        intervalSeconds: Math.max(5, Math.floor((c.interval ?? 60_000) / 1000)),
        expectedStatus: c.expectedStatus ?? 200,
        isActive: c.isActive,
        status: c.status,
        lastCheckedAt: toDate(c.lastCheckedAt),
        lastResponseTime: c.lastResponseTime,
        lastStatusCode: c.lastStatusCode,
        uptimePercent: c.uptimePercent,
        updatedAt: new Date(),
      },
    });
}

async function deleteHttpCheck(db: Db, c: HttpCheck): Promise<void> {
  await db.delete(schema.httpChecks).where(sql`${schema.httpChecks.id} = ${c._id}`);
}

async function writeHttpCheckResults(
  db: Db,
  rows: Array<HttpCheckResult & { checkId: string; userId: string }>,
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(schema.httpCheckResults).values(
    rows.map((r) => ({
      time: new Date(r.timestamp),
      checkId: r.checkId,
      userId: r.userId,
      statusCode: r.statusCode,
      responseTime: r.responseTime,
      status: r.status,
      sslDaysRemaining: r.sslDaysRemaining,
      error: r.error,
    })),
  );
}

async function writePipeline(db: Db, p: PipelineRecord): Promise<void> {
  await db
    .insert(schema.pipelines)
    .values({
      id: p._id,
      userId: p.userId,
      source: p.source,
      repo: p.repo,
      branch: p.branch,
      pipelineName: p.pipelineName,
      runId: p.runId,
      runNumber: p.runNumber,
      status: p.status,
      triggeredBy: p.triggeredBy,
      commitSha: p.commitSha,
      commitMessage: p.commitMessage,
      url: p.url,
      startedAt: toDate(p.startedAt),
      finishedAt: toDate(p.finishedAt),
      durationMs: p.duration,
      stages: p.stages ?? [],
    })
    .onConflictDoUpdate({
      target: [schema.pipelines.userId, schema.pipelines.source, schema.pipelines.runId],
      set: {
        status: p.status,
        startedAt: toDate(p.startedAt),
        finishedAt: toDate(p.finishedAt),
        durationMs: p.duration,
        stages: p.stages ?? [],
        updatedAt: new Date(),
      },
    });
}

async function deletePipeline(db: Db, p: PipelineRecord): Promise<void> {
  await db.delete(schema.pipelines).where(sql`${schema.pipelines.id} = ${p._id}`);
}

async function writeChannel(db: Db, c: NotificationChannel): Promise<void> {
  await db
    .insert(schema.notificationChannels)
    .values({
      id: c._id,
      userId: c.userId,
      type: c.type,
      name: c.name,
      config: c.config ?? {},
      isActive: c.isActive,
    })
    .onConflictDoUpdate({
      target: schema.notificationChannels.id,
      set: {
        type: c.type,
        name: c.name,
        config: c.config ?? {},
        isActive: c.isActive,
        updatedAt: new Date(),
      },
    });
}

async function deleteChannel(db: Db, c: NotificationChannel): Promise<void> {
  await db
    .delete(schema.notificationChannels)
    .where(sql`${schema.notificationChannels.id} = ${c._id}`);
}

async function writeDockerSnapshots(
  db: Db,
  containers: DockerContainer[],
): Promise<void> {
  if (containers.length === 0) return;
  await db.insert(schema.dockerContainers).values(
    containers.map((c) => ({
      time: new Date(),
      userId: c.userId,
      serverId: c.serverId,
      containerId: c.containerId,
      name: c.name,
      image: c.image,
      status: c.status,
      state: c.state,
      cpuPercent: c.cpuPercent,
      memUsage: c.memUsage,
      memLimit: c.memLimit,
      memPercent: c.memPercent,
      netRx: c.netRx,
      netTx: c.netTx,
      restarts: c.restarts,
    })),
  );
}

async function writeStatusPageConfig(
  db: Db,
  c: StatusPageConfig,
): Promise<void> {
  await db
    .insert(schema.statusPageConfig)
    .values({
      userId: c.userId,
      title: c.title,
      description: c.description,
      isPublic: c.isPublic,
      customServices: c.customServices ?? [],
    })
    .onConflictDoUpdate({
      target: schema.statusPageConfig.userId,
      set: {
        title: c.title,
        description: c.description,
        isPublic: c.isPublic,
        customServices: c.customServices ?? [],
        updatedAt: new Date(),
      },
    });
}

// ── Dispatcher ────────────────────────────────────────────────────────────

async function writeTcpCheck(db: Db, c: TcpCheck): Promise<void> {
  await db
    .insert(schema.tcpChecks)
    .values({
      id: c._id,
      userId: c.userId,
      name: c.name,
      host: c.host,
      port: c.port,
      intervalSeconds: Math.max(5, Math.floor(c.interval / 1000)),
      timeoutMs: c.timeoutMs,
      isActive: c.isActive,
      status: c.status,
      lastCheckedAt: toDate(c.lastCheckedAt),
    })
    .onConflictDoUpdate({
      target: schema.tcpChecks.id,
      set: {
        name: c.name,
        host: c.host,
        port: c.port,
        intervalSeconds: Math.max(5, Math.floor(c.interval / 1000)),
        timeoutMs: c.timeoutMs,
        isActive: c.isActive,
        status: c.status,
        lastCheckedAt: toDate(c.lastCheckedAt),
      },
    });
}
async function deleteTcpCheck(db: Db, c: TcpCheck): Promise<void> {
  await db.delete(schema.tcpChecks).where(sql`${schema.tcpChecks.id} = ${c._id}`);
}

async function writePingCheck(db: Db, c: PingCheck): Promise<void> {
  await db
    .insert(schema.pingChecks)
    .values({
      id: c._id,
      userId: c.userId,
      name: c.name,
      host: c.host,
      intervalSeconds: Math.max(5, Math.floor(c.interval / 1000)),
      isActive: c.isActive,
      status: c.status,
      lastLatencyMs: c.lastLatencyMs,
      lastPacketLoss: c.lastPacketLoss,
      lastCheckedAt: toDate(c.lastCheckedAt),
    })
    .onConflictDoUpdate({
      target: schema.pingChecks.id,
      set: {
        name: c.name,
        host: c.host,
        intervalSeconds: Math.max(5, Math.floor(c.interval / 1000)),
        isActive: c.isActive,
        status: c.status,
        lastLatencyMs: c.lastLatencyMs,
        lastPacketLoss: c.lastPacketLoss,
        lastCheckedAt: toDate(c.lastCheckedAt),
      },
    });
}
async function deletePingCheck(db: Db, c: PingCheck): Promise<void> {
  await db.delete(schema.pingChecks).where(sql`${schema.pingChecks.id} = ${c._id}`);
}

async function writeDnsCheck(db: Db, c: DnsCheck): Promise<void> {
  await db
    .insert(schema.dnsChecks)
    .values({
      id: c._id,
      userId: c.userId,
      name: c.name,
      domain: c.domain,
      recordType: c.recordType,
      expected: c.expected,
      intervalSeconds: Math.max(30, Math.floor(c.interval / 1000)),
      isActive: c.isActive,
      status: c.status,
      lastCheckedAt: toDate(c.lastCheckedAt),
    })
    .onConflictDoUpdate({
      target: schema.dnsChecks.id,
      set: {
        name: c.name,
        domain: c.domain,
        recordType: c.recordType,
        expected: c.expected,
        intervalSeconds: Math.max(30, Math.floor(c.interval / 1000)),
        isActive: c.isActive,
        status: c.status,
        lastCheckedAt: toDate(c.lastCheckedAt),
      },
    });
}
async function deleteDnsCheck(db: Db, c: DnsCheck): Promise<void> {
  await db.delete(schema.dnsChecks).where(sql`${schema.dnsChecks.id} = ${c._id}`);
}

async function writeHeartbeat(db: Db, m: HeartbeatMonitor): Promise<void> {
  await db
    .insert(schema.heartbeatMonitors)
    .values({
      id: m._id,
      userId: m.userId,
      name: m.name,
      slug: m.slug,
      expectedEverySeconds: m.expectedEverySeconds,
      gracePeriodSeconds: m.gracePeriodSeconds,
      lastPingAt: toDate(m.lastPingAt),
      status: m.status,
      isActive: m.isActive,
    })
    .onConflictDoUpdate({
      target: schema.heartbeatMonitors.id,
      set: {
        name: m.name,
        expectedEverySeconds: m.expectedEverySeconds,
        gracePeriodSeconds: m.gracePeriodSeconds,
        lastPingAt: toDate(m.lastPingAt),
        status: m.status,
        isActive: m.isActive,
      },
    });
}
async function deleteHeartbeat(db: Db, m: HeartbeatMonitor): Promise<void> {
  await db.delete(schema.heartbeatMonitors).where(sql`${schema.heartbeatMonitors.id} = ${m._id}`);
}

// ── Phase 3: events + incidents ────────────────────────────────────────

async function writeEvents(db: Db, records: EventRecord[]): Promise<void> {
  if (records.length === 0) return;
  const rows = records.map((e) => ({
    time: new Date(e.time),
    id: e._id,
    userId: e.userId,
    kind: e.kind,
    source: e.source,
    severity: e.severity,
    title: e.title,
    detail: e.detail ?? {},
  }));
  await db.insert(schema.events).values(rows);
}

async function writeIncident(db: Db, i: IncidentRecord): Promise<void> {
  await db
    .insert(schema.incidents)
    .values({
      id: i._id,
      userId: i.userId,
      title: i.title,
      status: i.status,
      severity: i.severity,
      services: i.services ?? [],
      resolvedAt: toDate(i.resolvedAt),
    })
    .onConflictDoUpdate({
      target: schema.incidents.id,
      set: {
        title: i.title,
        status: i.status,
        severity: i.severity,
        services: i.services ?? [],
        resolvedAt: toDate(i.resolvedAt),
        updatedAt: new Date(),
      },
    });
}
async function deleteIncident(db: Db, i: IncidentRecord): Promise<void> {
  await db.delete(schema.incidents).where(sql`${schema.incidents.id} = ${i._id}`);
}

async function writeIncidentUpdate(db: Db, u: IncidentUpdateRecord): Promise<void> {
  await db
    .insert(schema.incidentUpdates)
    .values({
      id: u._id,
      incidentId: u.incidentId,
      status: u.status,
      message: u.message,
      createdAt: toDate(u.createdAt) ?? new Date(),
    })
    .onConflictDoNothing();
}

export function attachPersistence(deps: PersistDeps): () => void {
  const { db, log } = deps;

  async function handle(evt: MutationEvent): Promise<void> {
    try {
      switch (evt.kind) {
        case "users":
          if (evt.op === "upsert") await writeUser(db, evt.data as SystemUser);
          break;
        case "servers":
          if (evt.op === "upsert") await writeServer(db, evt.data as ServerRecord);
          else if (evt.op === "delete" && evt.scope) await deleteServer(db, evt.scope);
          break;
        case "metrics":
          if (evt.op === "batchInsert") await writeMetrics(db, evt.data as MetricRecord[]);
          break;
        case "alertRules":
          if (evt.op === "upsert") await writeAlertRule(db, evt.data as AlertRule);
          else if (evt.op === "delete") await deleteAlertRule(db, evt.data as AlertRule);
          break;
        case "alertHistory":
          if (evt.op === "upsert") await writeAlertHistory(db, evt.data as AlertHistoryEntry);
          break;
        case "httpChecks":
          if (evt.op === "upsert") await writeHttpCheck(db, evt.data as HttpCheck);
          else if (evt.op === "delete") await deleteHttpCheck(db, evt.data as HttpCheck);
          break;
        case "httpCheckResults":
          if (evt.op === "batchInsert") {
            await writeHttpCheckResults(
              db,
              evt.data as Array<HttpCheckResult & { checkId: string; userId: string }>,
            );
          }
          break;
        case "pipelines":
          if (evt.op === "upsert") await writePipeline(db, evt.data as PipelineRecord);
          else if (evt.op === "delete") await deletePipeline(db, evt.data as PipelineRecord);
          break;
        case "notificationChannels":
          if (evt.op === "upsert") await writeChannel(db, evt.data as NotificationChannel);
          else if (evt.op === "delete") await deleteChannel(db, evt.data as NotificationChannel);
          break;
        case "dockerContainers":
          if (evt.op === "batchInsert") {
            await writeDockerSnapshots(db, evt.data as DockerContainer[]);
          }
          break;
        case "statusPageConfig":
          if (evt.op === "upsert") await writeStatusPageConfig(db, evt.data as StatusPageConfig);
          break;
        case "refreshTokens":
          if (evt.op === "upsert") await writeRefreshToken(db, evt.data as RefreshTokenRecord);
          break;
        case "tcpChecks":
          if (evt.op === "upsert") await writeTcpCheck(db, evt.data as TcpCheck);
          else if (evt.op === "delete") await deleteTcpCheck(db, evt.data as TcpCheck);
          break;
        case "pingChecks":
          if (evt.op === "upsert") await writePingCheck(db, evt.data as PingCheck);
          else if (evt.op === "delete") await deletePingCheck(db, evt.data as PingCheck);
          break;
        case "dnsChecks":
          if (evt.op === "upsert") await writeDnsCheck(db, evt.data as DnsCheck);
          else if (evt.op === "delete") await deleteDnsCheck(db, evt.data as DnsCheck);
          break;
        case "heartbeatMonitors":
          if (evt.op === "upsert") await writeHeartbeat(db, evt.data as HeartbeatMonitor);
          else if (evt.op === "delete") await deleteHeartbeat(db, evt.data as HeartbeatMonitor);
          break;
        case "events":
          if (evt.op === "batchInsert") await writeEvents(db, evt.data as EventRecord[]);
          break;
        case "incidents":
          if (evt.op === "upsert") await writeIncident(db, evt.data as IncidentRecord);
          else if (evt.op === "delete") await deleteIncident(db, evt.data as IncidentRecord);
          break;
        case "incidentUpdates":
          if (evt.op === "upsert") await writeIncidentUpdate(db, evt.data as IncidentUpdateRecord);
          break;
      }
    } catch (err) {
      log.error({ err, kind: evt.kind, op: evt.op }, "persistence write failed");
    }
  }

  const unsubscribe = subscribe((evt) => {
    // Fire-and-forget. Never block the publisher.
    void handle(evt);
  });

  return unsubscribe;
}
