/**
 * In-memory data store — preserved from the original store.js.
 * Used when no DATABASE_URL is configured (zero-config mode).
 *
 * Metrics stored in a ring buffer per user+host, capped at MAX_METRICS_PER_SERVER.
 * Old metrics auto-expire based on METRIC_TTL_MS (7 days).
 * Persistent data (users, servers, alert rules, etc.) saved to ~/.theoria/store.json.
 */

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
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
  TcpCheckResult,
  PingCheck,
  PingCheckResult,
  DnsCheck,
  DnsCheckResult,
  HeartbeatMonitor,
  EventRecord,
  EventKind,
  IncidentRecord,
  IncidentUpdateRecord,
  IncidentStatus,
  IncidentSeverity,
} from "../shared/types.js";
import { publish } from "./bus.js";

// ── Config ──
const METRIC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_METRICS_PER_SERVER = 100_000;
const PERSIST_DIR = path.join(os.homedir(), ".theoria");
const PERSIST_FILE = path.join(PERSIST_DIR, "store.json");
const PERSIST_DEBOUNCE_MS = 5000;
export const SYSTEM_USER_ID = "000000000000000000000001";

/**
 * Constant-time string equality. `===` on strings is not guaranteed to be
 * constant-time in V8, so use it when comparing secrets (API keys, token
 * hashes). Returns false immediately for mismatched lengths \u2014 that's fine
 * because the length of a hash/API key isn't itself a secret.
 */
function timingSafeStrEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * JSON snapshot gate.
 *
 * The snapshot is the only source of truth in zero-config mode. As soon as
 * `DATABASE_URL` is set, Postgres owns state and the snapshot becomes
 * redundant (and a minor information-leak surface since it contains bcrypt
 * hashes + API keys on the host FS).
 *
 * Rules:
 *   - `SKIP_JSON_SNAPSHOT=1` → never read or write the file.
 *   - `DATABASE_URL` set AND `SKIP_JSON_SNAPSHOT` unset → skip writes, but
 *     still read the file once on boot so operators who enabled Postgres
 *     mid-flight don't silently drop users on the first restart.
 *   - Otherwise (zero-config mode) → read + write as before.
 */
const SKIP_JSON_SNAPSHOT =
  process.env.SKIP_JSON_SNAPSHOT === "1" ||
  process.env.SKIP_JSON_SNAPSHOT === "true" ||
  !!process.env.DATABASE_URL;

function genId(): string {
  return crypto.randomBytes(12).toString("hex");
}

// ── The store data ──
interface StoreData {
  users: SystemUser[];
  servers: ServerRecord[];
  metrics: MetricRecord[];
  alertRules: AlertRule[];
  alertHistory: AlertHistoryEntry[];
  httpChecks: (HttpCheck & { results: HttpCheckResult[] })[];
  pipelines: PipelineRecord[];
  notificationChannels: NotificationChannel[];
  dockerContainers: DockerContainer[];
  statusPageConfig: StatusPageConfig | null;
  refreshTokens: RefreshTokenRecord[];
  tcpChecks: (TcpCheck & { results: TcpCheckResult[] })[];
  pingChecks: (PingCheck & { results: PingCheckResult[] })[];
  dnsChecks: (DnsCheck & { results: DnsCheckResult[] })[];
  heartbeatMonitors: HeartbeatMonitor[];
  events: EventRecord[];
  incidents: IncidentRecord[];
  incidentUpdates: IncidentUpdateRecord[];
  auditLog: AuditLogEntry[];
}

const data: StoreData = {
  users: [],
  servers: [],
  metrics: [],
  alertRules: [],
  alertHistory: [],
  httpChecks: [],
  pipelines: [],
  notificationChannels: [],
  dockerContainers: [],
  statusPageConfig: null,
  refreshTokens: [],
  tcpChecks: [],
  pingChecks: [],
  dnsChecks: [],
  heartbeatMonitors: [],
  events: [],
  incidents: [],
  incidentUpdates: [],
  auditLog: [],
};

// ── Persistence ──
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (SKIP_JSON_SNAPSHOT) return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistSync();
  }, PERSIST_DEBOUNCE_MS);
}

function persistSync(): void {
  if (SKIP_JSON_SNAPSHOT) return;
  try {
    fs.mkdirSync(PERSIST_DIR, { recursive: true, mode: 0o700 });
    const snapshot = {
      users: data.users,
      servers: data.servers,
      alertRules: data.alertRules,
      alertHistory: data.alertHistory,
      httpChecks: data.httpChecks.map(({ results, ...config }) => config),
      pipelines: data.pipelines,
      notificationChannels: data.notificationChannels,
      statusPageConfig: data.statusPageConfig,
      refreshTokens: data.refreshTokens,
      tcpChecks: data.tcpChecks.map(({ results, ...config }) => config),
      pingChecks: data.pingChecks.map(({ results, ...config }) => config),
      dnsChecks: data.dnsChecks.map(({ results, ...config }) => config),
      heartbeatMonitors: data.heartbeatMonitors,
      incidents: data.incidents,
      incidentUpdates: data.incidentUpdates,
      auditLog: data.auditLog,
    };
    // Write with 0600 perms — the file contains bcrypt hashes and API keys.
    const tmp = PERSIST_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(snapshot), { mode: 0o600 });
    fs.renameSync(tmp, PERSIST_FILE);
  } catch (err: unknown) {
    console.error("Store persist error:", (err as Error).message);
  }
}

function loadFromDisk(): void {
  // SKIP_JSON_SNAPSHOT gates both reads and writes — tests and DATABASE_URL
  // mode must start from a clean in-memory state so results don't leak across
  // runs. Without this guard, a stale ~/.theoria/store.json from a previous
  // run will silently hydrate tests (e.g. a prior status-page test leaving
  // `isPublic: true` breaks the "404 when not enabled" assertion).
  if (SKIP_JSON_SNAPSHOT) return;
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PERSIST_FILE, "utf8"));
      if (raw.users) {
        // Backfill new required fields for snapshots written before the auth
        // schema was extended.
        data.users = raw.users.map((u: Partial<SystemUser>) => ({
          _id: u._id ?? "",
          email: u.email ?? "",
          password: u.password ?? "",
          apiKey: u.apiKey ?? crypto.randomUUID(),
          role: u.role ?? (u.email === "system@theoria.local" ? "admin" : "user"),
          isSystem: u.isSystem ?? u.email === "system@theoria.local",
          createdAt: u.createdAt ?? new Date().toISOString(),
          updatedAt: u.updatedAt ?? new Date().toISOString(),
        })) as SystemUser[];
      }
      if (raw.servers) data.servers = raw.servers;
      if (raw.alertRules) data.alertRules = raw.alertRules;
      if (raw.alertHistory) data.alertHistory = raw.alertHistory;
      if (raw.httpChecks)
        data.httpChecks = raw.httpChecks.map((c: HttpCheck) => ({ ...c, results: [] }));
      if (raw.pipelines) data.pipelines = raw.pipelines;
      if (raw.notificationChannels) data.notificationChannels = raw.notificationChannels;
      if (raw.statusPageConfig) data.statusPageConfig = raw.statusPageConfig;
      if (raw.refreshTokens) data.refreshTokens = raw.refreshTokens;
      if (raw.tcpChecks)
        data.tcpChecks = raw.tcpChecks.map((c: TcpCheck) => ({ ...c, results: [] }));
      if (raw.pingChecks)
        data.pingChecks = raw.pingChecks.map((c: PingCheck) => ({ ...c, results: [] }));
      if (raw.dnsChecks)
        data.dnsChecks = raw.dnsChecks.map((c: DnsCheck) => ({ ...c, results: [] }));
      if (raw.heartbeatMonitors) data.heartbeatMonitors = raw.heartbeatMonitors;
      if (raw.incidents) data.incidents = raw.incidents;
      if (raw.incidentUpdates) data.incidentUpdates = raw.incidentUpdates;
      if (raw.auditLog) data.auditLog = raw.auditLog;
      console.log(
        `Store loaded: ${data.users.length} users, ${data.servers.length} servers, ${data.alertRules.length} rules`,
      );
    }
  } catch (err: unknown) {
    console.error("Store load error:", (err as Error).message);
  }
}

loadFromDisk();

// ── System user ──
function ensureSystemUser(): SystemUser {
  let user = data.users.find((u) => u._id === SYSTEM_USER_ID);
  if (!user) {
    user = {
      _id: SYSTEM_USER_ID,
      email: "system@theoria.local",
      password: "",
      apiKey: crypto.randomUUID(),
      role: "admin",
      isSystem: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.users.push(user);
    schedulePersist();
    console.log(`System API key: ${user.apiKey}`);
  } else {
    // Backfill role/isSystem on pre-existing system user records.
    user.role = "admin";
    user.isSystem = true;
  }
  return user;
}

const systemUser = ensureSystemUser();

// ── Metric cleanup (every 60s) ──
setInterval(() => {
  const cutoff = Date.now() - METRIC_TTL_MS;
  const before = data.metrics.length;
  data.metrics = data.metrics.filter((m) => m.timestamp >= cutoff);
  if (data.metrics.length < before) {
    const byServer: Record<string, number> = {};
    // Use \x1f (unit separator) so host strings containing ':' (IPv6, labels)
    // don't break the reverse split.
    const SEP = "\x1f";
    for (const m of data.metrics) {
      const key = `${m.userId}${SEP}${m.labels?.host || ""}`;
      byServer[key] = (byServer[key] || 0) + 1;
    }
    for (const [key, count] of Object.entries(byServer)) {
      if (count > MAX_METRICS_PER_SERVER) {
        const [userId, host] = key.split(SEP);
        const serverMetrics = data.metrics.filter(
          (m) => m.userId === userId && m.labels?.host === host,
        );
        serverMetrics.sort((a, b) => a.timestamp - b.timestamp);
        const toRemove = new Set(
          serverMetrics.slice(0, count - MAX_METRICS_PER_SERVER).map((m) => m._id),
        );
        data.metrics = data.metrics.filter((m) => !toRemove.has(m._id));
      }
    }
  }
}, 60_000);

// Auto-cleanup alert history older than 30 days
setInterval(() => {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const before = data.alertHistory.length;
  data.alertHistory = data.alertHistory.filter(
    (a) => new Date(a.firedAt).getTime() >= cutoff,
  );
  if (data.alertHistory.length < before) schedulePersist();
}, 3_600_000);

// ── Users ──
const Users = {
  findById(id: string): SystemUser | null {
    return data.users.find((u) => u._id === id) ?? null;
  },
  findByEmail(email: string): SystemUser | null {
    return data.users.find((u) => u.email === email.toLowerCase().trim()) ?? null;
  },
  findByApiKey(apiKey: string): SystemUser | null {
    return data.users.find((u) => u.apiKey != null && timingSafeStrEqual(u.apiKey, apiKey)) ?? null;
  },
  count(): number {
    return data.users.length;
  },
  countNonSystem(): number {
    return data.users.filter((u) => !u.isSystem).length;
  },
  create(input: {
    email: string;
    password: string;
    apiKey?: string;
    role?: "admin" | "user";
    isSystem?: boolean;
  }): SystemUser {
    const now = new Date().toISOString();
    const user: SystemUser = {
      _id: genId(),
      email: input.email.toLowerCase().trim(),
      password: input.password,
      apiKey: input.apiKey || crypto.randomUUID(),
      role: input.role ?? "user",
      isSystem: input.isSystem ?? false,
      createdAt: now,
      updatedAt: now,
    };
    data.users.push(user);
    schedulePersist();
    publish({ kind: "users", op: "upsert", data: user });
    return user;
  },
  updatePassword(id: string, passwordHash: string): SystemUser | null {
    const user = this.findById(id);
    if (!user) return null;
    user.password = passwordHash;
    user.updatedAt = new Date().toISOString();
    schedulePersist();
    publish({ kind: "users", op: "upsert", data: user });
    return user;
  },
  updateApiKey(id: string): SystemUser | null {
    const user = this.findById(id);
    if (!user) return null;
    user.apiKey = crypto.randomUUID();
    user.updatedAt = new Date().toISOString();
    schedulePersist();
    publish({ kind: "users", op: "upsert", data: user });
    return user;
  },
  replaceAll(users: SystemUser[]): void {
    data.users = users;
  },
  listAll(): SystemUser[] {
    return data.users.slice();
  },
};

// ── Servers ──
const Servers = {
  find(userId: string): ServerRecord[] {
    return data.servers
      .filter((s) => s.userId === userId)
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  },
  findOne(userId: string, serverId: string): ServerRecord | null {
    return data.servers.find((s) => s.userId === userId && s.serverId === serverId) ?? null;
  },
  upsert(userId: string, serverId: string, updates: Partial<ServerRecord>): ServerRecord {
    let server = this.findOne(userId, serverId);
    if (server) {
      Object.assign(server, updates, { userId, serverId, updatedAt: new Date().toISOString() });
    } else {
      server = {
        _id: genId(),
        userId,
        serverId,
        name: serverId,
        status: "online",
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...updates,
      } as ServerRecord;
      data.servers.push(server);
    }
    schedulePersist();
    publish({ kind: "servers", op: "upsert", data: server });
    return server;
  },
  update(userId: string, serverId: string, updates: Partial<ServerRecord>): ServerRecord | null {
    const server = this.findOne(userId, serverId);
    if (!server) return null;
    Object.assign(server, updates, { updatedAt: new Date().toISOString() });
    schedulePersist();
    publish({ kind: "servers", op: "upsert", data: server });
    return server;
  },
  delete(userId: string, serverId: string): ServerRecord | null {
    const idx = data.servers.findIndex((s) => s.userId === userId && s.serverId === serverId);
    if (idx === -1) return null;
    const removed = data.servers.splice(idx, 1)[0];
    schedulePersist();
    publish({ kind: "servers", op: "delete", data: removed, scope: { userId, serverId } });
    return removed;
  },
  replaceAll(servers: ServerRecord[]): void {
    data.servers = servers;
  },
};

// ── Metrics ──
const Metrics = {
  insertMany(docs: Array<{ userId: string; name: string; value: number; labels: Record<string, string>; timestamp: Date | number }>): void {
    const records: MetricRecord[] = [];
    for (const doc of docs) {
      const record: MetricRecord = {
        _id: genId(),
        userId: doc.userId,
        name: doc.name,
        value: doc.value,
        labels: doc.labels || {},
        timestamp: doc.timestamp instanceof Date ? doc.timestamp.getTime() : doc.timestamp,
      };
      data.metrics.push(record);
      records.push(record);
    }
    if (records.length > 0) {
      publish({ kind: "metrics", op: "batchInsert", data: records });
    }
  },
  find(userId: string, host: string, startTime: Date | number): MetricRecord[] {
    const startMs = startTime instanceof Date ? startTime.getTime() : startTime;
    return data.metrics
      .filter((m) => m.userId === userId && m.labels?.host === host && m.timestamp >= startMs)
      .sort((a, b) => a.timestamp - b.timestamp);
  },
  deleteByHost(userId: string, host: string): void {
    data.metrics = data.metrics.filter(
      (m) => !(m.userId === userId && m.labels?.host === host),
    );
    publish({ kind: "metrics", op: "delete", data: null, scope: { userId, host } });
  },
};

// ── Alert Rules ──
const AlertRules = {
  find(filter: { userId?: string; isActive?: boolean; "labels.host"?: string } = {}): AlertRule[] {
    return data.alertRules
      .filter((r) => {
        if (filter.userId && r.userId !== filter.userId) return false;
        if (filter.isActive !== undefined && r.isActive !== filter.isActive) return false;
        if (filter["labels.host"] && r.labels?.host !== filter["labels.host"]) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  findById(id: string): AlertRule | null {
    return data.alertRules.find((r) => r._id === id) ?? null;
  },
  findOne(userId: string, name: string): AlertRule | null {
    return data.alertRules.find((r) => r.userId === userId && r.name === name) ?? null;
  },
  upsert(userId: string, name: string, updates: Partial<AlertRule>): AlertRule {
    let rule = this.findOne(userId, name);
    if (rule) {
      Object.assign(rule, updates, { updatedAt: new Date().toISOString() });
    } else {
      rule = {
        _id: genId(),
        userId,
        name,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...updates,
      } as AlertRule;
      data.alertRules.push(rule);
    }
    schedulePersist();
    publish({ kind: "alertRules", op: "upsert", data: rule });
    return rule;
  },
  delete(id: string, userId: string): AlertRule | null {
    const idx = data.alertRules.findIndex((r) => r._id === id && r.userId === userId);
    if (idx === -1) return null;
    const removed = data.alertRules.splice(idx, 1)[0];
    schedulePersist();
    publish({ kind: "alertRules", op: "delete", data: removed });
    return removed;
  },
  toggleActive(id: string, userId: string): AlertRule | null {
    const rule = data.alertRules.find((r) => r._id === id && r.userId === userId);
    if (!rule) return null;
    rule.isActive = !rule.isActive;
    rule.updatedAt = new Date().toISOString();
    schedulePersist();
    publish({ kind: "alertRules", op: "upsert", data: rule });
    return rule;
  },
  replaceAll(rules: AlertRule[]): void {
    data.alertRules = rules;
  },
};

// ── Alert History ──
const AlertHistory = {
  find(filter: { userId?: string; status?: string; ruleId?: string } = {}, limit = 50): AlertHistoryEntry[] {
    return data.alertHistory
      .filter((a) => {
        if (filter.userId && a.userId !== filter.userId) return false;
        if (filter.status && a.status !== filter.status) return false;
        if (filter.ruleId && a.ruleId !== filter.ruleId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime())
      .slice(0, limit);
  },
  findFiring(ruleId: string): AlertHistoryEntry | null {
    return data.alertHistory.find((a) => a.ruleId === ruleId && a.status === "firing") ?? null;
  },
  countFiring(userId: string): number {
    return data.alertHistory.filter((a) => a.userId === userId && a.status === "firing").length;
  },
  create(input: Partial<AlertHistoryEntry> & { userId: string }): AlertHistoryEntry {
    const entry: AlertHistoryEntry = {
      _id: genId(),
      firedAt: new Date().toISOString(),
      status: "firing",
      createdAt: new Date().toISOString(),
      ...input,
    } as AlertHistoryEntry;
    data.alertHistory.push(entry);
    schedulePersist();
    publish({ kind: "alertHistory", op: "upsert", data: entry });
    return entry;
  },
  resolve(ruleId: string, userId: string): AlertHistoryEntry | null {
    const entry = data.alertHistory.find(
      (a) => a.ruleId === ruleId && a.userId === userId && a.status === "firing",
    );
    if (!entry) return null;
    entry.status = "resolved";
    entry.resolvedAt = new Date().toISOString();
    schedulePersist();
    publish({ kind: "alertHistory", op: "upsert", data: entry });
    return entry;
  },
  resolveByRuleId(ruleId: string): number {
    let count = 0;
    const resolved: AlertHistoryEntry[] = [];
    for (const a of data.alertHistory) {
      if (a.ruleId === ruleId && a.status === "firing") {
        a.status = "resolved";
        a.resolvedAt = new Date().toISOString();
        count++;
        resolved.push(a);
      }
    }
    if (count > 0) {
      schedulePersist();
      for (const entry of resolved) {
        publish({ kind: "alertHistory", op: "upsert", data: entry });
      }
    }
    return count;
  },
  replaceAll(entries: AlertHistoryEntry[]): void {
    data.alertHistory = entries;
  },
};

// ── HTTP Checks ──
const HttpChecks = {
  find(userId: string): HttpCheck[] {
    return data.httpChecks
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  findById(id: string): (HttpCheck & { results: HttpCheckResult[] }) | null {
    return data.httpChecks.find((c) => c._id === id) ?? null;
  },
  findActive(): (HttpCheck & { results: HttpCheckResult[] })[] {
    return data.httpChecks.filter((c) => c.isActive);
  },
  create(input: Partial<HttpCheck>): HttpCheck & { results: HttpCheckResult[] } {
    const check = {
      _id: genId(),
      status: "pending",
      lastCheckedAt: null,
      lastResponseTime: null,
      lastStatusCode: null,
      sslExpiry: null,
      uptimePercent: 100,
      results: [],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...input,
    } as HttpCheck & { results: HttpCheckResult[] };
    data.httpChecks.push(check);
    schedulePersist();
    publish({ kind: "httpChecks", op: "upsert", data: check });
    return check;
  },
  update(id: string, updates: Partial<HttpCheck & { results: HttpCheckResult[] }>): (HttpCheck & { results: HttpCheckResult[] }) | null {
    const check = this.findById(id);
    if (!check) return null;
    const prevResultsLen = check.results?.length ?? 0;
    Object.assign(check, updates, { updatedAt: new Date().toISOString() });
    schedulePersist();
    publish({ kind: "httpChecks", op: "upsert", data: check });
    // Emit newly appended results as time-series rows.
    const newResults = (updates.results || []).slice(prevResultsLen);
    if (newResults.length > 0) {
      publish({
        kind: "httpCheckResults",
        op: "batchInsert",
        data: newResults.map((r) => ({ ...r, checkId: check._id, userId: check.userId })),
      });
    }
    return check;
  },
  delete(id: string, userId: string): HttpCheck | null {
    const idx = data.httpChecks.findIndex((c) => c._id === id && c.userId === userId);
    if (idx === -1) return null;
    const removed = data.httpChecks.splice(idx, 1)[0];
    schedulePersist();
    publish({ kind: "httpChecks", op: "delete", data: removed });
    return removed;
  },
  toggleActive(id: string, userId: string): (HttpCheck & { results: HttpCheckResult[] }) | null {
    const check = data.httpChecks.find((c) => c._id === id && c.userId === userId);
    if (!check) return null;
    check.isActive = !check.isActive;
    check.updatedAt = new Date().toISOString();
    schedulePersist();
    publish({ kind: "httpChecks", op: "upsert", data: check });
    return check;
  },
  replaceAll(checks: (HttpCheck & { results: HttpCheckResult[] })[]): void {
    data.httpChecks = checks;
  },
};

// ── Pipelines ──
const Pipelines = {
  find(userId: string, filter: { source?: string; status?: string; repo?: string; branch?: string; limit?: number } = {}): PipelineRecord[] {
    return data.pipelines
      .filter((p) => {
        if (p.userId !== userId) return false;
        if (filter.source && p.source !== filter.source) return false;
        if (filter.status && p.status !== filter.status) return false;
        if (filter.repo && p.repo !== filter.repo) return false;
        if (filter.branch && p.branch !== filter.branch) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, filter.limit || 100);
  },
  findById(id: string): PipelineRecord | null {
    return data.pipelines.find((p) => p._id === id) ?? null;
  },
  upsert(userId: string, source: string, runId: string, input: Partial<PipelineRecord>): PipelineRecord {
    let pipeline = data.pipelines.find(
      (p) => p.userId === userId && p.source === source && p.runId === String(runId),
    );
    const now = new Date().toISOString();
    if (pipeline) {
      Object.assign(pipeline, input, { updatedAt: now });
      if (input.finishedAt && input.startedAt) {
        pipeline.duration = new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime();
      }
    } else {
      pipeline = {
        _id: genId(),
        userId,
        source,
        runId: String(runId),
        createdAt: now,
        updatedAt: now,
        ...input,
      } as PipelineRecord;
      if (input.finishedAt && input.startedAt) {
        pipeline.duration = new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime();
      }
      data.pipelines.push(pipeline);
    }
    schedulePersist();
    publish({ kind: "pipelines", op: "upsert", data: pipeline });
    return pipeline;
  },
  delete(runId: string, userId: string): PipelineRecord | null {
    const idx = data.pipelines.findIndex((p) => p.runId === String(runId) && p.userId === userId);
    if (idx === -1) return null;
    const removed = data.pipelines.splice(idx, 1)[0];
    schedulePersist();
    publish({ kind: "pipelines", op: "delete", data: removed });
    return removed;
  },
  getStats(userId: string) {
    const userPipelines = data.pipelines.filter((p) => p.userId === userId);
    const total = userPipelines.length;
    const success = userPipelines.filter((p) => p.status === "success").length;
    const failure = userPipelines.filter((p) => p.status === "failure").length;
    const running = userPipelines.filter((p) => p.status === "running").length;
    return {
      total, success, failure, running,
      successRate: total > 0 ? Math.round((success / total) * 100) : 0,
    };
  },
  replaceAll(pipelines: PipelineRecord[]): void {
    data.pipelines = pipelines;
  },
};

// ── Notification Channels ──
const NotificationChannels = {
  find(userId: string): NotificationChannel[] {
    return data.notificationChannels
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  findById(id: string): NotificationChannel | null {
    return data.notificationChannels.find((c) => c._id === id) ?? null;
  },
  findActive(userId: string): NotificationChannel[] {
    return data.notificationChannels.filter((c) => c.userId === userId && c.isActive);
  },
  create(input: Partial<NotificationChannel>): NotificationChannel {
    const channel = {
      _id: genId(),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...input,
    } as NotificationChannel;
    data.notificationChannels.push(channel);
    schedulePersist();
    publish({ kind: "notificationChannels", op: "upsert", data: channel });
    return channel;
  },
  update(id: string, updates: Partial<NotificationChannel>): NotificationChannel | null {
    const channel = this.findById(id);
    if (!channel) return null;
    Object.assign(channel, updates, { updatedAt: new Date().toISOString() });
    schedulePersist();
    publish({ kind: "notificationChannels", op: "upsert", data: channel });
    return channel;
  },
  delete(id: string, userId: string): NotificationChannel | null {
    const idx = data.notificationChannels.findIndex((c) => c._id === id && c.userId === userId);
    if (idx === -1) return null;
    const removed = data.notificationChannels.splice(idx, 1)[0];
    schedulePersist();
    publish({ kind: "notificationChannels", op: "delete", data: removed });
    return removed;
  },
  toggleActive(id: string, userId: string): NotificationChannel | null {
    const channel = data.notificationChannels.find((c) => c._id === id && c.userId === userId);
    if (!channel) return null;
    channel.isActive = !channel.isActive;
    channel.updatedAt = new Date().toISOString();
    schedulePersist();
    publish({ kind: "notificationChannels", op: "upsert", data: channel });
    return channel;
  },
  replaceAll(channels: NotificationChannel[]): void {
    data.notificationChannels = channels;
  },
};

// ── Docker Containers ──
const DockerContainers = {
  find(userId: string, serverId: string): DockerContainer[] {
    return data.dockerContainers.filter((c) => c.userId === userId && c.serverId === serverId);
  },
  findAll(userId: string): DockerContainer[] {
    return data.dockerContainers.filter((c) => c.userId === userId);
  },
  upsertMany(userId: string, serverId: string, containers: Array<Partial<DockerContainer>>): void {
    const updated: DockerContainer[] = [];
    for (const container of containers) {
      const existing = data.dockerContainers.find(
        (c) => c.userId === userId && c.serverId === serverId && c.containerId === container.containerId,
      );
      if (existing) {
        Object.assign(existing, container, { updatedAt: new Date().toISOString() });
        updated.push(existing);
      } else {
        const next = {
          _id: genId(),
          userId,
          serverId,
          updatedAt: new Date().toISOString(),
          ...container,
        } as DockerContainer;
        data.dockerContainers.push(next);
        updated.push(next);
      }
    }
    if (updated.length > 0) {
      publish({ kind: "dockerContainers", op: "batchInsert", data: updated });
    }
  },
};

// ── Status Page Config ──
const StatusPageConfigStore = {
  get(userId: string): StatusPageConfig | null {
    return data.statusPageConfig && data.statusPageConfig.userId === userId
      ? data.statusPageConfig
      : null;
  },
  /**
   * Returns the singleton status-page config regardless of owner. Used by the
   * public status page endpoint where no user context is available.
   */
  getAny(): StatusPageConfig | null {
    return data.statusPageConfig;
  },
  upsert(userId: string, updates: Partial<StatusPageConfig>): StatusPageConfig {
    if (!data.statusPageConfig || data.statusPageConfig.userId !== userId) {
      data.statusPageConfig = {
        userId,
        title: "System Status",
        description: "",
        isPublic: false,
        customServices: [],
        updatedAt: new Date().toISOString(),
        ...updates,
      };
    } else {
      Object.assign(data.statusPageConfig, updates, { updatedAt: new Date().toISOString() });
    }
    schedulePersist();
    publish({ kind: "statusPageConfig", op: "upsert", data: data.statusPageConfig });
    return data.statusPageConfig;
  },
  replaceAll(config: StatusPageConfig | null): void {
    data.statusPageConfig = config;
  },
};

// ── Refresh Tokens ──
// Stores only sha256 hashes of refresh tokens. The raw tokens are never persisted.
const RefreshTokens = {
  create(input: { userId: string; tokenHash: string; expiresAt: string }): RefreshTokenRecord {
    const record: RefreshTokenRecord = {
      _id: genId(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    };
    data.refreshTokens.push(record);
    schedulePersist();
    publish({ kind: "refreshTokens", op: "upsert", data: record });
    return record;
  },
  findValidByHash(tokenHash: string): RefreshTokenRecord | null {
    const now = Date.now();
    const record = data.refreshTokens.find((t) => timingSafeStrEqual(t.tokenHash, tokenHash));
    if (!record) return null;
    if (record.revokedAt) return null;
    if (new Date(record.expiresAt).getTime() < now) return null;
    return record;
  },
  revoke(tokenHash: string): RefreshTokenRecord | null {
    const record = data.refreshTokens.find((t) => timingSafeStrEqual(t.tokenHash, tokenHash));
    if (!record || record.revokedAt) return null;
    record.revokedAt = new Date().toISOString();
    schedulePersist();
    publish({ kind: "refreshTokens", op: "upsert", data: record });
    return record;
  },
  revokeAllForUser(userId: string): number {
    let count = 0;
    const now = new Date().toISOString();
    for (const r of data.refreshTokens) {
      if (r.userId === userId && !r.revokedAt) {
        r.revokedAt = now;
        count++;
        publish({ kind: "refreshTokens", op: "upsert", data: r });
      }
    }
    if (count > 0) schedulePersist();
    return count;
  },
  pruneExpired(): number {
    const before = data.refreshTokens.length;
    const now = Date.now();
    data.refreshTokens = data.refreshTokens.filter(
      (t) => new Date(t.expiresAt).getTime() >= now && !t.revokedAt,
    );
    const removed = before - data.refreshTokens.length;
    if (removed > 0) schedulePersist();
    return removed;
  },
  replaceAll(tokens: RefreshTokenRecord[]): void {
    data.refreshTokens = tokens;
  },
};

// Prune expired/revoked refresh tokens hourly to keep the store compact.
setInterval(() => RefreshTokens.pruneExpired(), 3_600_000);

// ── TCP Checks ──
const MAX_CHECK_RESULTS = 100;

const TcpChecks = {
  find(userId: string): TcpCheck[] {
    return data.tcpChecks
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  findById(id: string): (TcpCheck & { results: TcpCheckResult[] }) | null {
    return data.tcpChecks.find((c) => c._id === id) ?? null;
  },
  findActive(): (TcpCheck & { results: TcpCheckResult[] })[] {
    return data.tcpChecks.filter((c) => c.isActive);
  },
  create(input: Partial<TcpCheck> & { userId: string; name: string; host: string; port: number }): TcpCheck & { results: TcpCheckResult[] } {
    const now = new Date().toISOString();
    const check = {
      _id: genId(),
      userId: input.userId,
      name: input.name,
      host: input.host,
      port: input.port,
      interval: input.interval ?? 60_000,
      timeoutMs: input.timeoutMs ?? 5_000,
      isActive: input.isActive ?? true,
      status: "pending" as const,
      lastCheckedAt: null,
      lastLatencyMs: null,
      lastError: null,
      uptimePercent: 100,
      results: [],
      createdAt: now,
      updatedAt: now,
    };
    data.tcpChecks.push(check);
    schedulePersist();
    publish({ kind: "tcpChecks", op: "upsert", data: check });
    return check;
  },
  update(id: string, updates: Partial<TcpCheck & { results: TcpCheckResult[] }>): (TcpCheck & { results: TcpCheckResult[] }) | null {
    const check = this.findById(id);
    if (!check) return null;
    Object.assign(check, updates, { updatedAt: new Date().toISOString() });
    schedulePersist();
    publish({ kind: "tcpChecks", op: "upsert", data: check });
    return check;
  },
  delete(id: string, userId: string): TcpCheck | null {
    const idx = data.tcpChecks.findIndex((c) => c._id === id && c.userId === userId);
    if (idx === -1) return null;
    const removed = data.tcpChecks.splice(idx, 1)[0];
    schedulePersist();
    publish({ kind: "tcpChecks", op: "delete", data: removed });
    return removed;
  },
  toggleActive(id: string, userId: string): (TcpCheck & { results: TcpCheckResult[] }) | null {
    const check = data.tcpChecks.find((c) => c._id === id && c.userId === userId);
    if (!check) return null;
    check.isActive = !check.isActive;
    check.updatedAt = new Date().toISOString();
    schedulePersist();
    publish({ kind: "tcpChecks", op: "upsert", data: check });
    return check;
  },
  replaceAll(checks: (TcpCheck & { results: TcpCheckResult[] })[]): void {
    data.tcpChecks = checks;
  },
};

// ── Ping Checks ──
const PingChecks = {
  find(userId: string): PingCheck[] {
    return data.pingChecks
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  findById(id: string): (PingCheck & { results: PingCheckResult[] }) | null {
    return data.pingChecks.find((c) => c._id === id) ?? null;
  },
  findActive(): (PingCheck & { results: PingCheckResult[] })[] {
    return data.pingChecks.filter((c) => c.isActive);
  },
  create(input: Partial<PingCheck> & { userId: string; name: string; host: string }): PingCheck & { results: PingCheckResult[] } {
    const now = new Date().toISOString();
    const check = {
      _id: genId(),
      userId: input.userId,
      name: input.name,
      host: input.host,
      interval: input.interval ?? 60_000,
      isActive: input.isActive ?? true,
      status: "pending" as const,
      lastCheckedAt: null,
      lastLatencyMs: null,
      lastPacketLoss: null,
      lastError: null,
      uptimePercent: 100,
      results: [],
      createdAt: now,
      updatedAt: now,
    };
    data.pingChecks.push(check);
    schedulePersist();
    publish({ kind: "pingChecks", op: "upsert", data: check });
    return check;
  },
  update(id: string, updates: Partial<PingCheck & { results: PingCheckResult[] }>): (PingCheck & { results: PingCheckResult[] }) | null {
    const check = this.findById(id);
    if (!check) return null;
    Object.assign(check, updates, { updatedAt: new Date().toISOString() });
    schedulePersist();
    publish({ kind: "pingChecks", op: "upsert", data: check });
    return check;
  },
  delete(id: string, userId: string): PingCheck | null {
    const idx = data.pingChecks.findIndex((c) => c._id === id && c.userId === userId);
    if (idx === -1) return null;
    const removed = data.pingChecks.splice(idx, 1)[0];
    schedulePersist();
    publish({ kind: "pingChecks", op: "delete", data: removed });
    return removed;
  },
  toggleActive(id: string, userId: string): (PingCheck & { results: PingCheckResult[] }) | null {
    const check = data.pingChecks.find((c) => c._id === id && c.userId === userId);
    if (!check) return null;
    check.isActive = !check.isActive;
    check.updatedAt = new Date().toISOString();
    schedulePersist();
    publish({ kind: "pingChecks", op: "upsert", data: check });
    return check;
  },
  replaceAll(checks: (PingCheck & { results: PingCheckResult[] })[]): void {
    data.pingChecks = checks;
  },
};

// ── DNS Checks ──
const DnsChecks = {
  find(userId: string): DnsCheck[] {
    return data.dnsChecks
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  findById(id: string): (DnsCheck & { results: DnsCheckResult[] }) | null {
    return data.dnsChecks.find((c) => c._id === id) ?? null;
  },
  findActive(): (DnsCheck & { results: DnsCheckResult[] })[] {
    return data.dnsChecks.filter((c) => c.isActive);
  },
  create(input: Partial<DnsCheck> & { userId: string; name: string; domain: string; recordType: DnsCheck["recordType"] }): DnsCheck & { results: DnsCheckResult[] } {
    const now = new Date().toISOString();
    const check = {
      _id: genId(),
      userId: input.userId,
      name: input.name,
      domain: input.domain,
      recordType: input.recordType,
      expected: input.expected ?? "",
      interval: input.interval ?? 300_000,
      isActive: input.isActive ?? true,
      status: "pending" as const,
      lastCheckedAt: null,
      lastLatencyMs: null,
      lastValues: [],
      lastError: null,
      uptimePercent: 100,
      results: [],
      createdAt: now,
      updatedAt: now,
    };
    data.dnsChecks.push(check);
    schedulePersist();
    publish({ kind: "dnsChecks", op: "upsert", data: check });
    return check;
  },
  update(id: string, updates: Partial<DnsCheck & { results: DnsCheckResult[] }>): (DnsCheck & { results: DnsCheckResult[] }) | null {
    const check = this.findById(id);
    if (!check) return null;
    Object.assign(check, updates, { updatedAt: new Date().toISOString() });
    schedulePersist();
    publish({ kind: "dnsChecks", op: "upsert", data: check });
    return check;
  },
  delete(id: string, userId: string): DnsCheck | null {
    const idx = data.dnsChecks.findIndex((c) => c._id === id && c.userId === userId);
    if (idx === -1) return null;
    const removed = data.dnsChecks.splice(idx, 1)[0];
    schedulePersist();
    publish({ kind: "dnsChecks", op: "delete", data: removed });
    return removed;
  },
  toggleActive(id: string, userId: string): (DnsCheck & { results: DnsCheckResult[] }) | null {
    const check = data.dnsChecks.find((c) => c._id === id && c.userId === userId);
    if (!check) return null;
    check.isActive = !check.isActive;
    check.updatedAt = new Date().toISOString();
    schedulePersist();
    publish({ kind: "dnsChecks", op: "upsert", data: check });
    return check;
  },
  replaceAll(checks: (DnsCheck & { results: DnsCheckResult[] })[]): void {
    data.dnsChecks = checks;
  },
};

// ── Heartbeat Monitors ──
const HeartbeatMonitors = {
  find(userId: string): HeartbeatMonitor[] {
    return data.heartbeatMonitors
      .filter((m) => m.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  findById(id: string): HeartbeatMonitor | null {
    return data.heartbeatMonitors.find((m) => m._id === id) ?? null;
  },
  findBySlug(slug: string): HeartbeatMonitor | null {
    return data.heartbeatMonitors.find((m) => m.slug === slug) ?? null;
  },
  findActive(): HeartbeatMonitor[] {
    return data.heartbeatMonitors.filter((m) => m.isActive);
  },
  create(input: Partial<HeartbeatMonitor> & { userId: string; name: string; slug: string; expectedEverySeconds: number }): HeartbeatMonitor {
    const now = new Date().toISOString();
    const monitor: HeartbeatMonitor = {
      _id: genId(),
      userId: input.userId,
      name: input.name,
      slug: input.slug,
      expectedEverySeconds: input.expectedEverySeconds,
      gracePeriodSeconds: input.gracePeriodSeconds ?? 30,
      lastPingAt: null,
      status: "pending",
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    data.heartbeatMonitors.push(monitor);
    schedulePersist();
    publish({ kind: "heartbeatMonitors", op: "upsert", data: monitor });
    return monitor;
  },
  update(id: string, updates: Partial<HeartbeatMonitor>): HeartbeatMonitor | null {
    const monitor = this.findById(id);
    if (!monitor) return null;
    Object.assign(monitor, updates, { updatedAt: new Date().toISOString() });
    schedulePersist();
    publish({ kind: "heartbeatMonitors", op: "upsert", data: monitor });
    return monitor;
  },
  delete(id: string, userId: string): HeartbeatMonitor | null {
    const idx = data.heartbeatMonitors.findIndex((m) => m._id === id && m.userId === userId);
    if (idx === -1) return null;
    const removed = data.heartbeatMonitors.splice(idx, 1)[0];
    schedulePersist();
    publish({ kind: "heartbeatMonitors", op: "delete", data: removed });
    return removed;
  },
  toggleActive(id: string, userId: string): HeartbeatMonitor | null {
    const monitor = data.heartbeatMonitors.find((m) => m._id === id && m.userId === userId);
    if (!monitor) return null;
    monitor.isActive = !monitor.isActive;
    monitor.updatedAt = new Date().toISOString();
    schedulePersist();
    publish({ kind: "heartbeatMonitors", op: "upsert", data: monitor });
    return monitor;
  },
  replaceAll(monitors: HeartbeatMonitor[]): void {
    data.heartbeatMonitors = monitors;
  },
};

const _MAX_CHECK_RESULTS_EXPORT = MAX_CHECK_RESULTS;

// ── Events (unified timeline; Phase 3) ──
// Ring-buffer per user, capped to prevent unbounded memory growth. Fresh
// events are appended; old events are dropped once EVENT_RING_CAP is reached.
// The hypertable in Postgres is the source of truth for longer ranges.
const EVENT_RING_CAP = 10_000;

const Events = {
  append(input: Omit<EventRecord, "_id"> & { _id?: string }): EventRecord {
    const rec: EventRecord = {
      _id: input._id ?? genId(),
      userId: input.userId,
      time: input.time,
      kind: input.kind,
      source: input.source,
      severity: input.severity,
      title: input.title,
      detail: input.detail,
    };
    data.events.push(rec);
    if (data.events.length > EVENT_RING_CAP) {
      data.events.splice(0, data.events.length - EVENT_RING_CAP);
    }
    publish({ kind: "events", op: "batchInsert", data: [rec] });
    return rec;
  },
  /**
   * Cursor-paginated fetch. Cursor is a millisecond timestamp; entries with
   * `time < cursor` are returned (descending). `kinds` and `source` filter the
   * result set. Limit is clamped to [1, 500].
   */
  list(opts: {
    userId: string;
    cursor?: number | null;
    limit?: number;
    kinds?: EventKind[] | null;
    source?: string | null;
    since?: number | null;
  }): EventRecord[] {
    const limit = Math.max(1, Math.min(500, opts.limit ?? 100));
    const kindSet = opts.kinds && opts.kinds.length > 0 ? new Set<EventKind>(opts.kinds) : null;
    const cursor = opts.cursor ?? Number.POSITIVE_INFINITY;
    const since = opts.since ?? 0;
    return data.events
      .filter((e) => {
        if (e.userId !== opts.userId) return false;
        if (e.time >= cursor) return false;
        if (e.time < since) return false;
        if (kindSet && !kindSet.has(e.kind)) return false;
        if (opts.source && e.source !== opts.source) return false;
        return true;
      })
      .sort((a, b) => b.time - a.time)
      .slice(0, limit);
  },
  /**
   * Events around a target timestamp ± windowMs. Used for alert correlation.
   */
  around(userId: string, targetMs: number, windowMs: number): EventRecord[] {
    const lo = targetMs - windowMs;
    const hi = targetMs + windowMs;
    return data.events
      .filter((e) => e.userId === userId && e.time >= lo && e.time <= hi)
      .sort((a, b) => a.time - b.time);
  },
  replaceAll(events: EventRecord[]): void {
    data.events = events.slice(-EVENT_RING_CAP);
  },
};

// ── Incidents (Phase 3) ──
const Incidents = {
  find(userId: string, opts: { status?: IncidentStatus; limit?: number } = {}): IncidentRecord[] {
    return data.incidents
      .filter((i) => {
        if (i.userId !== userId) return false;
        if (opts.status && i.status !== opts.status) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, opts.limit ?? 200);
  },
  findAnyActive(): IncidentRecord[] {
    return data.incidents.filter((i) => i.status !== "resolved");
  },
  findById(id: string): IncidentRecord | null {
    return data.incidents.find((i) => i._id === id) ?? null;
  },
  create(input: {
    userId: string;
    title: string;
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    services?: string[];
  }): IncidentRecord {
    const now = new Date().toISOString();
    const incident: IncidentRecord = {
      _id: genId(),
      userId: input.userId,
      title: input.title,
      status: input.status ?? "investigating",
      severity: input.severity ?? "minor",
      services: input.services ?? [],
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    data.incidents.push(incident);
    schedulePersist();
    publish({ kind: "incidents", op: "upsert", data: incident });
    return incident;
  },
  update(id: string, userId: string, updates: Partial<IncidentRecord>): IncidentRecord | null {
    const incident = data.incidents.find((i) => i._id === id && i.userId === userId);
    if (!incident) return null;
    Object.assign(incident, updates, { updatedAt: new Date().toISOString() });
    if (updates.status === "resolved" && !incident.resolvedAt) {
      incident.resolvedAt = new Date().toISOString();
    }
    schedulePersist();
    publish({ kind: "incidents", op: "upsert", data: incident });
    return incident;
  },
  delete(id: string, userId: string): IncidentRecord | null {
    const idx = data.incidents.findIndex((i) => i._id === id && i.userId === userId);
    if (idx === -1) return null;
    const removed = data.incidents.splice(idx, 1)[0];
    // Cascade updates removal
    data.incidentUpdates = data.incidentUpdates.filter((u) => u.incidentId !== id);
    schedulePersist();
    publish({ kind: "incidents", op: "delete", data: removed });
    return removed;
  },
  replaceAll(incidents: IncidentRecord[]): void {
    data.incidents = incidents;
  },
};

const IncidentUpdates = {
  findByIncident(incidentId: string): IncidentUpdateRecord[] {
    return data.incidentUpdates
      .filter((u) => u.incidentId === incidentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  },
  create(input: { incidentId: string; status: IncidentStatus; message: string }): IncidentUpdateRecord {
    const record: IncidentUpdateRecord = {
      _id: genId(),
      incidentId: input.incidentId,
      status: input.status,
      message: input.message,
      createdAt: new Date().toISOString(),
    };
    data.incidentUpdates.push(record);
    schedulePersist();
    publish({ kind: "incidentUpdates", op: "upsert", data: record });
    return record;
  },
  replaceAll(updates: IncidentUpdateRecord[]): void {
    data.incidentUpdates = updates;
  },
};

// ── Onboarding nonces (in-memory only; short-lived) ──
// Agent onboarding tokens carry a random nonce; we track unused nonces here
// so a token is single-use. Entries auto-expire.
const onboardingNonces = new Map<string, number>();
const OnboardingNonces = {
  add(nonce: string, ttlMs: number): void {
    onboardingNonces.set(nonce, Date.now() + ttlMs);
  },
  /** Returns true if the nonce was present and not expired (and consumes it). */
  consume(nonce: string): boolean {
    const expiry = onboardingNonces.get(nonce);
    if (!expiry) return false;
    onboardingNonces.delete(nonce);
    return expiry > Date.now();
  },
  prune(): void {
    const now = Date.now();
    for (const [nonce, expiry] of onboardingNonces) {
      if (expiry <= now) onboardingNonces.delete(nonce);
    }
  },
};
setInterval(() => OnboardingNonces.prune(), 60_000).unref?.();

// ── AuditLog (security-relevant events) ──────────────────────────────────
// Fixed-size ring buffer; survives restarts via JSON snapshot. Used for key
// rotations, failed logins, lockouts, and admin-sensitive actions.
export interface AuditLogEntry {
  _id: string;
  userId: string | null;
  action: string;
  detail: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

const AUDIT_LOG_MAX = 10_000;

const AuditLog = {
  record(input: Omit<AuditLogEntry, "_id" | "createdAt">): AuditLogEntry {
    const entry: AuditLogEntry = {
      _id: genId(),
      createdAt: new Date().toISOString(),
      ...input,
    };
    data.auditLog.push(entry);
    if (data.auditLog.length > AUDIT_LOG_MAX) {
      data.auditLog.splice(0, data.auditLog.length - AUDIT_LOG_MAX);
    }
    schedulePersist();
    return entry;
  },
  find(filter: { userId?: string; action?: string; limit?: number } = {}): AuditLogEntry[] {
    const limit = filter.limit ?? 100;
    return data.auditLog
      .filter((e) => {
        if (filter.userId && e.userId !== filter.userId) return false;
        if (filter.action && e.action !== filter.action) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },
  replaceAll(entries: AuditLogEntry[]): void {
    data.auditLog = entries.slice(-AUDIT_LOG_MAX);
  },
  listAll(): AuditLogEntry[] {
    return data.auditLog.slice();
  },
};

const store = {
  Users,
  Servers,
  Metrics,
  AlertRules,
  AlertHistory,
  HttpChecks,
  Pipelines,
  NotificationChannels,
  DockerContainers,
  StatusPageConfig: StatusPageConfigStore,
  RefreshTokens,
  OnboardingNonces,
  TcpChecks,
  PingChecks,
  DnsChecks,
  HeartbeatMonitors,
  Events,
  Incidents,
  IncidentUpdates,
  AuditLog,
  systemUser,
  SYSTEM_USER_ID,
  MAX_CHECK_RESULTS: _MAX_CHECK_RESULTS_EXPORT,
};

export default store;
export type Store = typeof store;
