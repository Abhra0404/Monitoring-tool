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
} from "../shared/types.js";

// ── Config ──
const METRIC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_METRICS_PER_SERVER = 100_000;
const PERSIST_DIR = path.join(os.homedir(), ".theoria");
const PERSIST_FILE = path.join(PERSIST_DIR, "store.json");
const PERSIST_DEBOUNCE_MS = 5000;
export const SYSTEM_USER_ID = "000000000000000000000001";

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
};

// ── Persistence ──
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistSync();
  }, PERSIST_DEBOUNCE_MS);
}

function persistSync(): void {
  try {
    fs.mkdirSync(PERSIST_DIR, { recursive: true });
    const snapshot = {
      users: data.users,
      servers: data.servers,
      alertRules: data.alertRules,
      alertHistory: data.alertHistory,
      httpChecks: data.httpChecks.map(({ results, ...config }) => config),
      pipelines: data.pipelines,
      notificationChannels: data.notificationChannels,
      statusPageConfig: data.statusPageConfig,
    };
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(snapshot));
  } catch (err: unknown) {
    console.error("Store persist error:", (err as Error).message);
  }
}

function loadFromDisk(): void {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PERSIST_FILE, "utf8"));
      if (raw.users) data.users = raw.users;
      if (raw.servers) data.servers = raw.servers;
      if (raw.alertRules) data.alertRules = raw.alertRules;
      if (raw.alertHistory) data.alertHistory = raw.alertHistory;
      if (raw.httpChecks)
        data.httpChecks = raw.httpChecks.map((c: HttpCheck) => ({ ...c, results: [] }));
      if (raw.pipelines) data.pipelines = raw.pipelines;
      if (raw.notificationChannels) data.notificationChannels = raw.notificationChannels;
      if (raw.statusPageConfig) data.statusPageConfig = raw.statusPageConfig;
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.users.push(user);
    schedulePersist();
    console.log(`System API key: ${user.apiKey}`);
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
    for (const m of data.metrics) {
      const key = `${m.userId}:${m.labels?.host || ""}`;
      byServer[key] = (byServer[key] || 0) + 1;
    }
    for (const [key, count] of Object.entries(byServer)) {
      if (count > MAX_METRICS_PER_SERVER) {
        const [userId, host] = key.split(":");
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
    return data.users.find((u) => u.apiKey === apiKey) ?? null;
  },
  create(input: { email: string; password: string; apiKey?: string }): SystemUser {
    const now = new Date().toISOString();
    const user: SystemUser = {
      _id: genId(),
      email: input.email.toLowerCase().trim(),
      password: input.password,
      apiKey: input.apiKey || crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    data.users.push(user);
    schedulePersist();
    return user;
  },
  updateApiKey(id: string): SystemUser | null {
    const user = this.findById(id);
    if (!user) return null;
    user.apiKey = crypto.randomUUID();
    user.updatedAt = new Date().toISOString();
    schedulePersist();
    return user;
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
    return server;
  },
  update(userId: string, serverId: string, updates: Partial<ServerRecord>): ServerRecord | null {
    const server = this.findOne(userId, serverId);
    if (!server) return null;
    Object.assign(server, updates, { updatedAt: new Date().toISOString() });
    schedulePersist();
    return server;
  },
  delete(userId: string, serverId: string): ServerRecord | null {
    const idx = data.servers.findIndex((s) => s.userId === userId && s.serverId === serverId);
    if (idx === -1) return null;
    const removed = data.servers.splice(idx, 1)[0];
    schedulePersist();
    return removed;
  },
};

// ── Metrics ──
const Metrics = {
  insertMany(docs: Array<{ userId: string; name: string; value: number; labels: Record<string, string>; timestamp: Date | number }>): void {
    for (const doc of docs) {
      data.metrics.push({
        _id: genId(),
        userId: doc.userId,
        name: doc.name,
        value: doc.value,
        labels: doc.labels || {},
        timestamp: doc.timestamp instanceof Date ? doc.timestamp.getTime() : doc.timestamp,
      });
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
    return rule;
  },
  delete(id: string, userId: string): AlertRule | null {
    const idx = data.alertRules.findIndex((r) => r._id === id && r.userId === userId);
    if (idx === -1) return null;
    const removed = data.alertRules.splice(idx, 1)[0];
    schedulePersist();
    return removed;
  },
  toggleActive(id: string, userId: string): AlertRule | null {
    const rule = data.alertRules.find((r) => r._id === id && r.userId === userId);
    if (!rule) return null;
    rule.isActive = !rule.isActive;
    rule.updatedAt = new Date().toISOString();
    schedulePersist();
    return rule;
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
    return entry;
  },
  resolveByRuleId(ruleId: string): number {
    let count = 0;
    for (const a of data.alertHistory) {
      if (a.ruleId === ruleId && a.status === "firing") {
        a.status = "resolved";
        a.resolvedAt = new Date().toISOString();
        count++;
      }
    }
    if (count > 0) schedulePersist();
    return count;
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
    return check;
  },
  update(id: string, updates: Partial<HttpCheck & { results: HttpCheckResult[] }>): (HttpCheck & { results: HttpCheckResult[] }) | null {
    const check = this.findById(id);
    if (!check) return null;
    Object.assign(check, updates, { updatedAt: new Date().toISOString() });
    schedulePersist();
    return check;
  },
  delete(id: string, userId: string): HttpCheck | null {
    const idx = data.httpChecks.findIndex((c) => c._id === id && c.userId === userId);
    if (idx === -1) return null;
    const removed = data.httpChecks.splice(idx, 1)[0];
    schedulePersist();
    return removed;
  },
  toggleActive(id: string, userId: string): (HttpCheck & { results: HttpCheckResult[] }) | null {
    const check = data.httpChecks.find((c) => c._id === id && c.userId === userId);
    if (!check) return null;
    check.isActive = !check.isActive;
    check.updatedAt = new Date().toISOString();
    schedulePersist();
    return check;
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
    return pipeline;
  },
  delete(runId: string, userId: string): PipelineRecord | null {
    const idx = data.pipelines.findIndex((p) => p.runId === String(runId) && p.userId === userId);
    if (idx === -1) return null;
    const removed = data.pipelines.splice(idx, 1)[0];
    schedulePersist();
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
    return channel;
  },
  update(id: string, updates: Partial<NotificationChannel>): NotificationChannel | null {
    const channel = this.findById(id);
    if (!channel) return null;
    Object.assign(channel, updates, { updatedAt: new Date().toISOString() });
    schedulePersist();
    return channel;
  },
  delete(id: string, userId: string): NotificationChannel | null {
    const idx = data.notificationChannels.findIndex((c) => c._id === id && c.userId === userId);
    if (idx === -1) return null;
    const removed = data.notificationChannels.splice(idx, 1)[0];
    schedulePersist();
    return removed;
  },
  toggleActive(id: string, userId: string): NotificationChannel | null {
    const channel = data.notificationChannels.find((c) => c._id === id && c.userId === userId);
    if (!channel) return null;
    channel.isActive = !channel.isActive;
    channel.updatedAt = new Date().toISOString();
    schedulePersist();
    return channel;
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
    for (const container of containers) {
      const existing = data.dockerContainers.find(
        (c) => c.userId === userId && c.serverId === serverId && c.containerId === container.containerId,
      );
      if (existing) {
        Object.assign(existing, container, { updatedAt: new Date().toISOString() });
      } else {
        data.dockerContainers.push({
          _id: genId(),
          userId,
          serverId,
          updatedAt: new Date().toISOString(),
          ...container,
        } as DockerContainer);
      }
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
    return data.statusPageConfig;
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
  systemUser,
  SYSTEM_USER_ID,
};

export default store;
export type Store = typeof store;
