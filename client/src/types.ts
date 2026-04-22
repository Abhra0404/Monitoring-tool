// ── Shared domain types used across components, hooks, and services ──

export type ServerStatus = "online" | "warning" | "offline";

export interface ServerRecord {
  serverId: string;
  name?: string;
  status: ServerStatus;
  platform?: string;
  arch?: string;
  cpuCount?: number;
  hostname?: string;
  lastSeen: string;
}

export interface MetricSnapshot {
  serverId: string;
  timestamp: number;
  cpu: number;
  totalMem: number;
  freeMem: number;
  memoryPercent?: number;
  uptime?: number;
  loadAvg1?: number;
  loadAvg5?: number;
  loadAvg15?: number;
  diskTotal?: number;
  diskFree?: number;
  diskPercent?: number;
  networkRx?: number;
  networkTx?: number;
  cpuCount?: number;
  platform?: string;
  arch?: string;
  hostname?: string;
}

export interface AlertRule {
  _id: string;
  name: string;
  metricName: string;
  operator: string;
  threshold: number;
  durationMinutes: number;
  isActive: boolean;
  labels?: Record<string, string>;
}

export interface AlertHistoryEntry {
  _id: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  value: number;
  threshold: number;
  status: "firing" | "resolved";
  firedAt: string;
  resolvedAt?: string;
  message?: string;
  id?: string; // socket event compat
}

export interface HttpCheck {
  _id: string;
  name: string;
  url: string;
  interval: number;
  expectedStatus?: number;
  isActive: boolean;
  status?: "up" | "down" | "unknown";
  latency?: number;
  uptimePercent?: number;
  lastCheckedAt?: string;
}

export interface HttpCheckResult {
  checkId: string;
  status: "up" | "down";
  latency: number;
  statusCode?: number;
  error?: string;
  timestamp: string;
}

// ── TCP / Ping / DNS / Heartbeat monitors (Phase 2) ──

export interface TcpCheck {
  _id: string;
  name: string;
  host: string;
  port: number;
  interval: number;
  timeoutMs: number;
  isActive: boolean;
  status?: "up" | "down" | "pending";
  lastLatencyMs?: number | null;
  uptimePercent?: number;
  lastCheckedAt?: string;
  lastError?: string | null;
}

export interface TcpCheckResult {
  checkId: string;
  name?: string;
  host?: string;
  status: "up" | "down";
  latencyMs: number;
  uptimePercent?: number;
  error?: string | null;
  timestamp: number;
}

export interface PingCheck {
  _id: string;
  name: string;
  host: string;
  interval: number;
  isActive: boolean;
  status?: "up" | "down" | "pending";
  lastLatencyMs?: number | null;
  lastPacketLoss?: number;
  uptimePercent?: number;
  lastCheckedAt?: string;
  lastError?: string | null;
}

export interface PingCheckResult {
  checkId: string;
  name?: string;
  host?: string;
  status: "up" | "down";
  latencyMs: number;
  packetLoss: number;
  uptimePercent?: number;
  error?: string | null;
  timestamp: number;
}

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SOA";

export interface DnsCheck {
  _id: string;
  name: string;
  domain: string;
  recordType: DnsRecordType;
  expected: string;
  interval: number;
  isActive: boolean;
  status?: "up" | "down" | "pending";
  lastLatencyMs?: number;
  lastValues?: string[];
  uptimePercent?: number;
  lastCheckedAt?: string;
  lastError?: string | null;
}

export interface DnsCheckResult {
  checkId: string;
  name?: string;
  domain?: string;
  recordType?: DnsRecordType;
  status: "up" | "down";
  latencyMs: number;
  values: string[];
  uptimePercent?: number;
  error?: string | null;
  timestamp: number;
}

export interface HeartbeatMonitor {
  _id: string;
  name: string;
  slug: string;
  expectedEverySeconds: number;
  gracePeriodSeconds: number;
  isActive: boolean;
  status?: "pending" | "up" | "down";
  lastPingAt?: string | null;
}

export interface HeartbeatEvent {
  monitorId: string;
  name?: string;
  slug: string;
  timestamp: number;
  lastPingAt?: string | null;
}

export interface Pipeline {
  _id: string;
  source: string;
  runId: string;
  status: "success" | "failure" | "running" | "pending" | "cancelled";
  branch?: string;
  repo?: string;
  commitSha?: string;
  commitMessage?: string;
  actor?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  url?: string;
}

export interface PipelineStats {
  total: number;
  success: number;
  failure: number;
  running: number;
}

export interface NotificationChannel {
  _id: string;
  type: "slack" | "email" | "discord" | "telegram" | "webhook";
  name: string;
  config: Record<string, string>;
  isActive: boolean;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  serverId: string;
  cpuPercent?: number;
  memPercent?: number;
}

export interface StatusPageConfig {
  title: string;
  description?: string;
  isPublic: boolean;
  customServices?: Array<{ name: string; status: string }>;
  customDomain?: string | null;
}

export interface PublicStatus {
  title: string;
  description: string;
  overall: "operational" | "degraded" | "partial_outage" | "major_outage";
  servers: Array<{ name: string; status: string; lastSeen: string }>;
  httpChecks: Array<{
    id?: string;
    name: string;
    url: string;
    status: string;
    uptimePercent?: number;
    lastCheckedAt?: string;
  }>;
  customServices: Array<{ name: string; status: string }>;
  activeIncidents?: Array<{
    _id: string;
    title: string;
    status: string;
    severity: string;
    services: string[];
    createdAt: string;
    updatedAt: string;
    updates: Array<{ _id: string; status: string; message: string; createdAt: string }>;
  }>;
  updatedAt: string;
}

export interface SystemUser {
  id: string;
  email: string;
  apiKey: string;
}

export type TimeRange = "5m" | "15m" | "1h" | "6h" | "24h" | "7d";
export type MetricColor = "emerald" | "amber" | "red" | "blue" | "purple" | "cyan";

// ── Phase 3: events, incidents, anomalies ──

export type EventKind =
  | "metric"
  | "alert_fired"
  | "alert_resolved"
  | "http_check"
  | "tcp_check"
  | "ping_check"
  | "dns_check"
  | "heartbeat_ping"
  | "heartbeat_missed"
  | "heartbeat_recovered"
  | "pipeline"
  | "server_online"
  | "server_offline"
  | "anomaly"
  | "incident_created"
  | "incident_updated"
  | "incident_resolved";

export type EventSeverity = "info" | "warning" | "error" | "critical";

export interface EventRecord {
  _id: string;
  userId: string;
  time: number;
  kind: EventKind;
  source: string;
  severity: EventSeverity;
  title: string;
  detail: Record<string, unknown>;
}

export interface EventListResponse {
  items: EventRecord[];
  nextCursor: string | null;
}

export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
export type IncidentSeverity = "minor" | "major" | "critical" | "maintenance";

export interface IncidentUpdate {
  _id: string;
  incidentId: string;
  status: IncidentStatus;
  message: string;
  createdAt: string;
}

export interface Incident {
  _id: string;
  userId: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  services: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdate[];
}

export interface AnomalyEvent {
  serverId: string;
  metric: string;
  value: number;
  zScore: number;
  mean: number;
  stddev: number;
  timestamp: number;
}

export interface UptimeDay {
  date: string;
  uptimePercent: number; // -1 when no samples in that day
  samples: number;
}

export interface UptimeSeries {
  checkId: string;
  name: string;
  url: string;
  days: UptimeDay[];
}

// ── Phase 4: Plugin system ──

export type PluginType =
  | "server-check"
  | "notification-provider"
  | "dashboard-panel"
  | "agent-collector";

export interface PluginConfigField {
  type: "string" | "number" | "boolean";
  format?: "password" | "url" | "email";
  default?: string | number | boolean;
  description?: string;
  required?: boolean;
  enum?: (string | number)[];
}

export interface PluginConfigSchema {
  type?: "object";
  properties?: Record<string, PluginConfigField>;
  required?: string[];
}

export interface PluginMetricDef {
  name: string;
  unit?: string;
  description?: string;
}

export interface InstalledPlugin {
  name: string;
  displayName: string;
  version: string;
  type: PluginType;
  description?: string;
  icon?: string;
  intervalSeconds?: number;
  metrics: PluginMetricDef[];
  configSchema: PluginConfigSchema | null;
}

export interface PluginInstanceRecord {
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
  config: Record<string, unknown>;
  lastRunAt?: string;
  lastStatus?: "up" | "down";
  lastLatencyMs?: number;
  lastDetail?: Record<string, unknown>;
  lastError?: string;
}

export interface PluginsListResponse {
  rootDir: string;
  installed: InstalledPlugin[];
  instances: PluginInstanceRecord[];
}

export interface PluginRunResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
  timedOut?: boolean;
}

export interface PluginResultEvent {
  instanceId: string;
  name: string;
  displayName: string;
  status: "up" | "down";
  latencyMs: number;
  detail: Record<string, unknown>;
  error?: string;
  timestamp: number;
}
