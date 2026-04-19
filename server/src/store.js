/**
 * In-memory data store — replaces MongoDB/Mongoose entirely.
 *
 * Collections: users, servers, metrics, alertRules, alertHistory
 *
 * Metrics are stored in a ring buffer per user+host capped at MAX_METRICS_PER_SERVER.
 * Old metrics auto-expire based on METRIC_TTL_MS (default 7 days).
 * Data is persisted to ~/.theoria/store.json on write (debounced) and loaded on startup.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// ── Config ──────────────────────────────────────────────────────────────
const METRIC_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_METRICS_PER_SERVER = 100000; // Max metric data points per server
const PERSIST_DIR = path.join(os.homedir(), ".theoria");
const PERSIST_FILE = path.join(PERSIST_DIR, "store.json");
const PERSIST_DEBOUNCE_MS = 5000;

// ── ID generation ───────────────────────────────────────────────────────
function genId() {
  return crypto.randomBytes(12).toString("hex");
}

// ── The Store ───────────────────────────────────────────────────────────
const store = {
  users: [],       // { _id, email, password, apiKey, createdAt, updatedAt }
  servers: [],     // { _id, userId, serverId, name, status, lastSeen, cpuCount, platform, arch, hostname }
  metrics: [],     // { _id, userId, name, value, labels, timestamp }
  alertRules: [],  // { _id, userId, name, metricName, labels, operator, threshold, durationMinutes, isActive, createdAt }
  alertHistory: [], // { _id, userId, ruleId, ruleName, metricName, labels, operator, threshold, actualValue, severity, status, firedAt, resolvedAt, message }
  httpChecks: [],   // { _id, userId, name, url, interval, expectedStatus, isActive, status, lastCheckedAt, lastResponseTime, lastStatusCode, sslExpiry, uptimePercent, results[], createdAt, updatedAt }
  pipelines: [],    // { _id, userId, source, repo, branch, pipelineName, runId, runNumber, status, triggeredBy, commitSha, commitMessage, url, startedAt, finishedAt, duration, stages[], createdAt, updatedAt }
  notificationChannels: [], // { _id, userId, type (slack|email), name, config, isActive, createdAt, updatedAt }
  dockerContainers: [],     // { _id, userId, serverId, containerId, name, image, status, state, cpuPercent, memUsage, memLimit, memPercent, netRx, netTx, restarts, updatedAt } (ephemeral)
  statusPageConfig: null,   // { userId, title, description, isPublic, customServices[], updatedAt }
};

// ── Persistence ─────────────────────────────────────────────────────────
let persistTimer = null;

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistSync();
  }, PERSIST_DEBOUNCE_MS);
}

function persistSync() {
  try {
    fs.mkdirSync(PERSIST_DIR, { recursive: true });
    // Save everything except metrics (too large, ephemeral)
    const snapshot = {
      users: store.users,
      servers: store.servers,
      alertRules: store.alertRules,
      alertHistory: store.alertHistory,
      httpChecks: store.httpChecks.map((c) => {
        const { results, ...config } = c;
        return config;
      }),
      pipelines: store.pipelines,
      notificationChannels: store.notificationChannels,
      statusPageConfig: store.statusPageConfig,
    };
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(snapshot));
  } catch (err) {
    console.error("Store persist error:", err.message);
  }
}

function loadFromDisk() {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const data = JSON.parse(fs.readFileSync(PERSIST_FILE, "utf8"));
      if (data.users) store.users = data.users;
      if (data.servers) store.servers = data.servers;
      if (data.alertRules) store.alertRules = data.alertRules;
      if (data.alertHistory) store.alertHistory = data.alertHistory;
      if (data.httpChecks) store.httpChecks = data.httpChecks.map((c) => ({ ...c, results: [] }));
      if (data.pipelines) store.pipelines = data.pipelines;
      if (data.notificationChannels) store.notificationChannels = data.notificationChannels;
      if (data.statusPageConfig) store.statusPageConfig = data.statusPageConfig;
      console.log(
        `Store loaded: ${store.users.length} users, ${store.servers.length} servers, ${store.alertRules.length} rules`
      );
    }
  } catch (err) {
    console.error("Store load error:", err.message);
  }
}

// Load on require
loadFromDisk();

// ── Ensure a default system user exists ─────────────────────────────────
const SYSTEM_USER_ID = "000000000000000000000001";
function ensureSystemUser() {
  let user = store.users.find((u) => u._id === SYSTEM_USER_ID);
  if (!user) {
    user = {
      _id: SYSTEM_USER_ID,
      email: "system@theoria.local",
      password: "",
      apiKey: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.users.push(user);
    schedulePersist();
  }
  return user;
}
const systemUser = ensureSystemUser();

// ── Metric cleanup (runs every 60s) ────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - METRIC_TTL_MS;
  const before = store.metrics.length;
  store.metrics = store.metrics.filter((m) => m.timestamp >= cutoff);
  if (store.metrics.length < before) {
    // Trim per-server if still too large
    const byServer = {};
    for (const m of store.metrics) {
      const key = `${m.userId}:${m.labels?.host || ""}`;
      if (!byServer[key]) byServer[key] = 0;
      byServer[key]++;
    }
    for (const [key, count] of Object.entries(byServer)) {
      if (count > MAX_METRICS_PER_SERVER) {
        const [userId, host] = key.split(":");
        const serverMetrics = store.metrics.filter(
          (m) => m.userId === userId && m.labels?.host === host
        );
        serverMetrics.sort((a, b) => a.timestamp - b.timestamp);
        const toRemove = new Set(
          serverMetrics.slice(0, count - MAX_METRICS_PER_SERVER).map((m) => m._id)
        );
        store.metrics = store.metrics.filter((m) => !toRemove.has(m._id));
      }
    }
  }
}, 60000);

// ── User operations ─────────────────────────────────────────────────────
const Users = {
  findById(id) {
    return store.users.find((u) => u._id === id) || null;
  },

  findByEmail(email) {
    return store.users.find((u) => u.email === email.toLowerCase().trim()) || null;
  },

  findByApiKey(apiKey) {
    return store.users.find((u) => u.apiKey === apiKey) || null;
  },

  create({ email, password, apiKey }) {
    const now = new Date().toISOString();
    const user = {
      _id: genId(),
      email: email.toLowerCase().trim(),
      password,
      apiKey: apiKey || crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    store.users.push(user);
    schedulePersist();
    return user;
  },

  updateApiKey(id) {
    const user = this.findById(id);
    if (!user) return null;
    user.apiKey = crypto.randomUUID();
    user.updatedAt = new Date().toISOString();
    schedulePersist();
    return user;
  },
};

// ── Server operations ───────────────────────────────────────────────────
const Servers = {
  find(userId) {
    return store.servers
      .filter((s) => s.userId === userId)
      .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  },

  findOne(userId, serverId) {
    return store.servers.find((s) => s.userId === userId && s.serverId === serverId) || null;
  },

  upsert(userId, serverId, data) {
    let server = this.findOne(userId, serverId);
    if (server) {
      Object.assign(server, data, { userId, serverId, updatedAt: new Date().toISOString() });
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
        ...data,
      };
      store.servers.push(server);
    }
    schedulePersist();
    return server;
  },

  update(userId, serverId, data) {
    const server = this.findOne(userId, serverId);
    if (!server) return null;
    Object.assign(server, data, { updatedAt: new Date().toISOString() });
    schedulePersist();
    return server;
  },

  delete(userId, serverId) {
    const idx = store.servers.findIndex((s) => s.userId === userId && s.serverId === serverId);
    if (idx === -1) return null;
    const removed = store.servers.splice(idx, 1)[0];
    schedulePersist();
    return removed;
  },
};

// ── Metric operations ───────────────────────────────────────────────────
const Metrics = {
  insertMany(docs) {
    for (const doc of docs) {
      store.metrics.push({
        _id: genId(),
        userId: doc.userId,
        name: doc.name,
        value: doc.value,
        labels: doc.labels || {},
        timestamp: doc.timestamp instanceof Date ? doc.timestamp.getTime() : doc.timestamp,
      });
    }
  },

  find(userId, host, startTime) {
    const startMs = startTime instanceof Date ? startTime.getTime() : startTime;
    return store.metrics
      .filter(
        (m) =>
          m.userId === userId &&
          m.labels?.host === host &&
          m.timestamp >= startMs
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  },

  deleteByHost(userId, host) {
    store.metrics = store.metrics.filter(
      (m) => !(m.userId === userId && m.labels?.host === host)
    );
  },
};

// ── AlertRule operations ────────────────────────────────────────────────
const AlertRules = {
  find(filter = {}) {
    return store.alertRules
      .filter((r) => {
        if (filter.userId && r.userId !== filter.userId) return false;
        if (filter.isActive !== undefined && r.isActive !== filter.isActive) return false;
        if (filter["labels.host"] && (!r.labels || r.labels.host !== filter["labels.host"])) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  findById(id) {
    return store.alertRules.find((r) => r._id === id) || null;
  },

  findOne(userId, name) {
    return store.alertRules.find((r) => r.userId === userId && r.name === name) || null;
  },

  upsert(userId, name, data) {
    let rule = this.findOne(userId, name);
    if (rule) {
      Object.assign(rule, data, { updatedAt: new Date().toISOString() });
    } else {
      rule = {
        _id: genId(),
        userId,
        name,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...data,
      };
      store.alertRules.push(rule);
    }
    schedulePersist();
    return rule;
  },

  delete(id, userId) {
    const idx = store.alertRules.findIndex((r) => r._id === id && r.userId === userId);
    if (idx === -1) return null;
    const removed = store.alertRules.splice(idx, 1)[0];
    schedulePersist();
    return removed;
  },

  toggleActive(id, userId) {
    const rule = store.alertRules.find((r) => r._id === id && r.userId === userId);
    if (!rule) return null;
    rule.isActive = !rule.isActive;
    rule.updatedAt = new Date().toISOString();
    schedulePersist();
    return rule;
  },
};

// ── AlertHistory operations ─────────────────────────────────────────────
const AlertHistoryStore = {
  find(filter = {}, limit = 50) {
    return store.alertHistory
      .filter((a) => {
        if (filter.userId && a.userId !== filter.userId) return false;
        if (filter.status && a.status !== filter.status) return false;
        if (filter.ruleId && a.ruleId !== filter.ruleId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.firedAt) - new Date(a.firedAt))
      .slice(0, limit);
  },

  findFiring(ruleId) {
    return store.alertHistory.find((a) => a.ruleId === ruleId && a.status === "firing") || null;
  },

  countFiring(userId) {
    return store.alertHistory.filter((a) => a.userId === userId && a.status === "firing").length;
  },

  create(data) {
    const entry = {
      _id: genId(),
      firedAt: new Date().toISOString(),
      status: "firing",
      createdAt: new Date().toISOString(),
      ...data,
    };
    store.alertHistory.push(entry);
    schedulePersist();
    return entry;
  },

  resolve(ruleId, userId) {
    const entry = store.alertHistory.find(
      (a) => a.ruleId === ruleId && a.userId === userId && a.status === "firing"
    );
    if (!entry) return null;
    entry.status = "resolved";
    entry.resolvedAt = new Date().toISOString();
    schedulePersist();
    return entry;
  },

  resolveByRuleId(ruleId) {
    let count = 0;
    for (const a of store.alertHistory) {
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

// Auto-cleanup alert history older than 30 days
setInterval(() => {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const before = store.alertHistory.length;
  store.alertHistory = store.alertHistory.filter(
    (a) => new Date(a.firedAt).getTime() >= cutoff
  );
  if (store.alertHistory.length < before) schedulePersist();
}, 3600000);

// ── HttpCheck operations ───────────────────────────────────────────────
const HttpChecks = {
  find(userId) {
    return store.httpChecks
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  findById(id) {
    return store.httpChecks.find((c) => c._id === id) || null;
  },

  findActive() {
    return store.httpChecks.filter((c) => c.isActive);
  },

  create(data) {
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
      ...data,
    };
    store.httpChecks.push(check);
    schedulePersist();
    return check;
  },

  update(id, data) {
    const check = this.findById(id);
    if (!check) return null;
    Object.assign(check, data, { updatedAt: new Date().toISOString() });
    schedulePersist();
    return check;
  },

  delete(id, userId) {
    const idx = store.httpChecks.findIndex(
      (c) => c._id === id && c.userId === userId
    );
    if (idx === -1) return null;
    const removed = store.httpChecks.splice(idx, 1)[0];
    schedulePersist();
    return removed;
  },

  toggleActive(id, userId) {
    const check = store.httpChecks.find(
      (c) => c._id === id && c.userId === userId
    );
    if (!check) return null;
    check.isActive = !check.isActive;
    check.updatedAt = new Date().toISOString();
    schedulePersist();
    return check;
  },
};

// ── Pipeline operations ───────────────────────────────────────────────
const Pipelines = {
  find(userId, filter = {}) {
    return store.pipelines
      .filter((p) => {
        if (p.userId !== userId) return false;
        if (filter.source && p.source !== filter.source) return false;
        if (filter.status && p.status !== filter.status) return false;
        if (filter.repo && p.repo !== filter.repo) return false;
        if (filter.branch && p.branch !== filter.branch) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, filter.limit || 100);
  },

  findById(id) {
    return store.pipelines.find((p) => p._id === id) || null;
  },

  upsert(userId, source, runId, data) {
    let pipeline = store.pipelines.find(
      (p) => p.userId === userId && p.source === source && p.runId === String(runId)
    );
    const now = new Date().toISOString();
    if (pipeline) {
      Object.assign(pipeline, data, { updatedAt: now });
      if (data.finishedAt && data.startedAt) {
        pipeline.duration = new Date(data.finishedAt) - new Date(data.startedAt);
      }
    } else {
      pipeline = {
        _id: genId(),
        userId,
        source,
        runId: String(runId),
        status: "pending",
        stages: [],
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      if (pipeline.finishedAt && pipeline.startedAt) {
        pipeline.duration = new Date(pipeline.finishedAt) - new Date(pipeline.startedAt);
      }
      store.pipelines.push(pipeline);
    }
    schedulePersist();
    return pipeline;
  },

  delete(id, userId) {
    const idx = store.pipelines.findIndex((p) => p._id === id && p.userId === userId);
    if (idx === -1) return null;
    const removed = store.pipelines.splice(idx, 1)[0];
    schedulePersist();
    return removed;
  },

  getStats(userId) {
    const userPipelines = store.pipelines.filter((p) => p.userId === userId);
    const total = userPipelines.length;
    const success = userPipelines.filter((p) => p.status === "success").length;
    const failure = userPipelines.filter((p) => p.status === "failure").length;
    const now = Date.now();
    const last24h = userPipelines.filter((p) => now - new Date(p.createdAt).getTime() < 86400000);
    const failures24h = last24h.filter((p) => p.status === "failure").length;
    const durations = userPipelines.filter((p) => p.duration > 0).map((p) => p.duration);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    return {
      total,
      success,
      failure,
      successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : 0,
      failures24h,
      avgDuration,
    };
  },
};

// Auto-cleanup pipelines older than 30 days
setInterval(() => {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const before = store.pipelines.length;
  store.pipelines = store.pipelines.filter(
    (p) => new Date(p.createdAt).getTime() >= cutoff
  );
  if (store.pipelines.length < before) schedulePersist();
}, 3600000);

// ── NotificationChannel operations ────────────────────────────────────
const NotificationChannels = {
  find(userId) {
    return store.notificationChannels
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  findById(id) {
    return store.notificationChannels.find((c) => c._id === id) || null;
  },

  findActive(userId) {
    return store.notificationChannels.filter((c) => c.userId === userId && c.isActive);
  },

  create(data) {
    const now = new Date().toISOString();
    const channel = {
      _id: genId(),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    store.notificationChannels.push(channel);
    schedulePersist();
    return channel;
  },

  update(id, data) {
    const channel = this.findById(id);
    if (!channel) return null;
    Object.assign(channel, data, { updatedAt: new Date().toISOString() });
    schedulePersist();
    return channel;
  },

  delete(id, userId) {
    const idx = store.notificationChannels.findIndex(
      (c) => c._id === id && c.userId === userId
    );
    if (idx === -1) return null;
    const removed = store.notificationChannels.splice(idx, 1)[0];
    schedulePersist();
    return removed;
  },

  toggleActive(id, userId) {
    const channel = store.notificationChannels.find(
      (c) => c._id === id && c.userId === userId
    );
    if (!channel) return null;
    channel.isActive = !channel.isActive;
    channel.updatedAt = new Date().toISOString();
    schedulePersist();
    return channel;
  },
};

// ── DockerContainer operations (ephemeral — not persisted) ────────────
const DockerContainers = {
  upsertMany(userId, serverId, containers) {
    // Remove old entries for this server
    store.dockerContainers = store.dockerContainers.filter(
      (c) => !(c.userId === userId && c.serverId === serverId)
    );
    const now = new Date().toISOString();
    for (const container of containers) {
      store.dockerContainers.push({
        _id: genId(),
        userId,
        serverId,
        ...container,
        updatedAt: now,
      });
    }
  },

  find(userId, serverId) {
    return store.dockerContainers.filter(
      (c) => c.userId === userId && c.serverId === serverId
    );
  },

  findAll(userId) {
    return store.dockerContainers.filter((c) => c.userId === userId);
  },
};

// ── StatusPageConfig operations ───────────────────────────────────────
const StatusPageConfig = {
  get(userId) {
    return store.statusPageConfig && store.statusPageConfig.userId === userId
      ? store.statusPageConfig
      : null;
  },

  upsert(userId, data) {
    const now = new Date().toISOString();
    if (store.statusPageConfig && store.statusPageConfig.userId === userId) {
      Object.assign(store.statusPageConfig, data, { updatedAt: now });
    } else {
      store.statusPageConfig = {
        userId,
        title: "System Status",
        description: "",
        isPublic: false,
        customServices: [],
        updatedAt: now,
        ...data,
      };
    }
    schedulePersist();
    return store.statusPageConfig;
  },
};

// Persist on process exit
process.on("exit", persistSync);
process.on("SIGINT", () => { persistSync(); process.exit(0); });
process.on("SIGTERM", () => { persistSync(); process.exit(0); });

module.exports = {
  genId,
  SYSTEM_USER_ID,
  systemUser,
  Users,
  Servers,
  Metrics,
  AlertRules,
  AlertHistory: AlertHistoryStore,
  HttpChecks,
  Pipelines,
  NotificationChannels,
  DockerContainers,
  StatusPageConfig,
};
