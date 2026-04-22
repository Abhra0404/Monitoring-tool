/**
 * Drizzle ORM schema for Theoria's production data layer.
 *
 * Tables are split into two categories:
 *  - Regular relational tables (users, servers, alert rules, etc.)
 *  - Time-series hypertables (metrics, http_check_results, docker_containers,
 *    events). These are marked with `isHypertable` in migration SQL and are
 *    partitioned by TimescaleDB.
 *
 * Every mutation through this schema is strongly typed via Drizzle's
 * inference. Modules should never write raw SQL except in migrations.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  bigint,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

// ── Users ─────────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    apiKey: varchar("api_key", { length: 128 }).notNull().unique(),
    role: varchar("role", { length: 32 }).notNull().default("user"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    apiKeyIdx: index("idx_users_api_key").on(t.apiKey),
  }),
);

// ── Servers ───────────────────────────────────────────────────────────────
export const servers = pgTable(
  "servers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serverId: varchar("server_id", { length: 128 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    hostname: varchar("hostname", { length: 255 }),
    platform: varchar("platform", { length: 64 }),
    arch: varchar("arch", { length: 32 }),
    cpuCount: integer("cpu_count"),
    status: varchar("status", { length: 32 }).notNull().default("offline"),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userServerUniq: uniqueIndex("uq_servers_user_server").on(t.userId, t.serverId),
    userLastSeenIdx: index("idx_servers_user_lastseen").on(t.userId, t.lastSeen),
  }),
);

// ── Metrics (hypertable) ──────────────────────────────────────────────────
export const metrics = pgTable(
  "metrics",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    userId: uuid("user_id").notNull(),
    serverId: varchar("server_id", { length: 128 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    value: doublePrecision("value").notNull(),
    labels: jsonb("labels").$type<Record<string, string>>().notNull().default({}),
  },
  (t) => ({
    serverTimeIdx: index("idx_metrics_user_server_time").on(t.userId, t.serverId, t.time),
    nameIdx: index("idx_metrics_user_server_name_time").on(
      t.userId,
      t.serverId,
      t.name,
      t.time,
    ),
  }),
);

// ── Alert Rules ───────────────────────────────────────────────────────────
export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    metricName: varchar("metric_name", { length: 128 }).notNull(),
    labels: jsonb("labels").$type<Record<string, string>>().notNull().default({}),
    operator: varchar("operator", { length: 8 }).notNull(),
    threshold: doublePrecision("threshold").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    severity: varchar("severity", { length: 16 }).notNull().default("warning"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userNameUniq: uniqueIndex("uq_alert_rules_user_name").on(t.userId, t.name),
    userActiveIdx: index("idx_alert_rules_user_active").on(t.userId, t.isActive),
  }),
);

// ── Alert History ─────────────────────────────────────────────────────────
export const alertHistory = pgTable(
  "alert_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => alertRules.id, { onDelete: "cascade" }),
    ruleName: varchar("rule_name", { length: 255 }).notNull(),
    metricName: varchar("metric_name", { length: 128 }).notNull(),
    labels: jsonb("labels").$type<Record<string, string>>().notNull().default({}),
    operator: varchar("operator", { length: 8 }).notNull(),
    threshold: doublePrecision("threshold").notNull(),
    actualValue: doublePrecision("actual_value").notNull(),
    severity: varchar("severity", { length: 16 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    message: text("message"),
    firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    userStatusIdx: index("idx_alert_history_user_status").on(t.userId, t.status),
    ruleStatusIdx: index("idx_alert_history_rule_status").on(t.ruleId, t.status),
    userFiredIdx: index("idx_alert_history_user_fired").on(t.userId, t.firedAt),
  }),
);

// ── HTTP Checks ───────────────────────────────────────────────────────────
export const httpChecks = pgTable(
  "http_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    url: text("url").notNull(),
    intervalSeconds: integer("interval_seconds").notNull().default(60),
    expectedStatus: integer("expected_status").notNull().default(200),
    timeoutMs: integer("timeout_ms").notNull().default(10_000),
    isActive: boolean("is_active").notNull().default(true),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastResponseTime: integer("last_response_time"),
    lastStatusCode: integer("last_status_code"),
    sslExpiry: timestamp("ssl_expiry", { withTimezone: true }),
    uptimePercent: doublePrecision("uptime_percent").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userActiveIdx: index("idx_http_checks_user_active").on(t.userId, t.isActive),
  }),
);

// ── HTTP Check Results (hypertable) ───────────────────────────────────────
export const httpCheckResults = pgTable(
  "http_check_results",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    checkId: uuid("check_id").notNull(),
    userId: uuid("user_id").notNull(),
    statusCode: integer("status_code"),
    responseTime: integer("response_time"),
    status: varchar("status", { length: 8 }).notNull(),
    sslDaysRemaining: integer("ssl_days_remaining"),
    error: text("error"),
  },
  (t) => ({
    checkTimeIdx: index("idx_http_check_results_check_time").on(t.checkId, t.time),
  }),
);

// ── Pipelines ─────────────────────────────────────────────────────────────
export const pipelines = pgTable(
  "pipelines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 32 }).notNull(),
    repo: varchar("repo", { length: 255 }).notNull(),
    branch: varchar("branch", { length: 255 }),
    pipelineName: varchar("pipeline_name", { length: 255 }),
    runId: varchar("run_id", { length: 128 }).notNull(),
    runNumber: integer("run_number"),
    status: varchar("status", { length: 32 }).notNull(),
    triggeredBy: varchar("triggered_by", { length: 255 }),
    commitSha: varchar("commit_sha", { length: 64 }),
    commitMessage: text("commit_message"),
    url: text("url"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: bigint("duration_ms", { mode: "number" }),
    stages: jsonb("stages").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userSourceRunUniq: uniqueIndex("uq_pipelines_user_source_run").on(
      t.userId,
      t.source,
      t.runId,
    ),
    userCreatedIdx: index("idx_pipelines_user_created").on(t.userId, t.createdAt),
  }),
);

// ── Notification Channels ─────────────────────────────────────────────────
export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("idx_notification_channels_user").on(t.userId),
  }),
);

// ── Docker Containers (hypertable — snapshots) ────────────────────────────
export const dockerContainers = pgTable(
  "docker_containers",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    userId: uuid("user_id").notNull(),
    serverId: varchar("server_id", { length: 128 }).notNull(),
    containerId: varchar("container_id", { length: 128 }).notNull(),
    name: varchar("name", { length: 255 }),
    image: varchar("image", { length: 255 }),
    status: varchar("status", { length: 32 }),
    state: varchar("state", { length: 32 }),
    cpuPercent: doublePrecision("cpu_percent"),
    memUsage: bigint("mem_usage", { mode: "number" }),
    memLimit: bigint("mem_limit", { mode: "number" }),
    memPercent: doublePrecision("mem_percent"),
    netRx: bigint("net_rx", { mode: "number" }),
    netTx: bigint("net_tx", { mode: "number" }),
    restarts: integer("restarts"),
  },
  (t) => ({
    serverTimeIdx: index("idx_docker_user_server_time").on(
      t.userId,
      t.serverId,
      t.time,
    ),
  }),
);

// ── Status Page Config ────────────────────────────────────────────────────
export const statusPageConfig = pgTable("status_page_config", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull().default("System Status"),
  description: text("description").notNull().default(""),
  isPublic: boolean("is_public").notNull().default(false),
  customDomain: varchar("custom_domain", { length: 255 }),
  customServices: jsonb("custom_services")
    .$type<Array<{ name: string; status: string; description?: string }>>()
    .notNull()
    .default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Incidents (Phase 3) ───────────────────────────────────────────────────
export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("investigating"),
    severity: varchar("severity", { length: 32 }).notNull().default("minor"),
    services: jsonb("services").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    userStatusIdx: index("idx_incidents_user_status").on(t.userId, t.status),
  }),
);

export const incidentUpdates = pgTable(
  "incident_updates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    incidentIdx: index("idx_incident_updates_incident").on(t.incidentId),
  }),
);

// ── Heartbeat Monitors (Phase 2) ──────────────────────────────────────────
export const heartbeatMonitors = pgTable(
  "heartbeat_monitors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull().unique(),
    expectedEverySeconds: integer("expected_every_seconds").notNull(),
    gracePeriodSeconds: integer("grace_period_seconds").notNull().default(0),
    lastPingAt: timestamp("last_ping_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("idx_heartbeat_user").on(t.userId),
  }),
);

// ── TCP / Ping / DNS Checks (Phase 2) ─────────────────────────────────────
export const tcpChecks = pgTable("tcp_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  port: integer("port").notNull(),
  intervalSeconds: integer("interval_seconds").notNull().default(60),
  timeoutMs: integer("timeout_ms").notNull().default(5_000),
  isActive: boolean("is_active").notNull().default(true),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pingChecks = pgTable("ping_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  intervalSeconds: integer("interval_seconds").notNull().default(60),
  isActive: boolean("is_active").notNull().default(true),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  lastLatencyMs: doublePrecision("last_latency_ms"),
  lastPacketLoss: doublePrecision("last_packet_loss"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dnsChecks = pgTable("dns_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }).notNull(),
  recordType: varchar("record_type", { length: 16 }).notNull().default("A"),
  expected: text("expected"),
  intervalSeconds: integer("interval_seconds").notNull().default(300),
  isActive: boolean("is_active").notNull().default(true),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Events (hypertable — unified timeline, Phase 3) ───────────────────────
export const events = pgTable(
  "events",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    id: uuid("id").defaultRandom().notNull(),
    userId: uuid("user_id").notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    source: varchar("source", { length: 32 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull().default("info"),
    title: varchar("title", { length: 255 }).notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.time, t.id] }),
    userTimeIdx: index("idx_events_user_time").on(t.userId, t.time),
    kindIdx: index("idx_events_user_kind_time").on(t.userId, t.kind, t.time),
  }),
);

// ── Refresh tokens (for real auth, Phase 6 security) ──────────────────────
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("idx_refresh_tokens_user").on(t.userId),
  }),
);

export const schema = {
  users,
  servers,
  metrics,
  alertRules,
  alertHistory,
  httpChecks,
  httpCheckResults,
  pipelines,
  notificationChannels,
  dockerContainers,
  statusPageConfig,
  incidents,
  incidentUpdates,
  heartbeatMonitors,
  tcpChecks,
  pingChecks,
  dnsChecks,
  events,
  refreshTokens,
};

export type Schema = typeof schema;
