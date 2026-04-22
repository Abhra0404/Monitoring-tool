// ── Shared types used across all server modules ──

export interface SystemUser {
  _id: string;
  email: string;
  /** bcrypt hash of the user's password. Empty string for system/agent-only users. */
  password: string;
  apiKey: string;
  role: "admin" | "user";
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshTokenRecord {
  _id: string;
  userId: string;
  /** sha256 hex of the raw refresh token — raw token is never persisted. */
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Authenticated principal attached to each request by the auth plugin.
 * Narrower than SystemUser — never carries the password hash.
 */
export interface AuthContext {
  _id: string;
  email: string;
  apiKey: string;
  role: "admin" | "user";
  isSystem: boolean;
  /** How the request was authenticated. */
  via: "jwt" | "apiKey";
}

export interface ServerRecord {
  _id: string;
  userId: string;
  serverId: string;
  name: string;
  status: "online" | "warning" | "critical" | "offline";
  lastSeen: string;
  cpuCount?: number;
  platform?: string;
  arch?: string;
  hostname?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetricRecord {
  _id: string;
  userId: string;
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface AlertRule {
  _id: string;
  userId: string;
  name: string;
  metricName: string;
  labels: Record<string, string>;
  operator: string;
  threshold: number;
  durationMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertHistoryEntry {
  _id: string;
  userId: string;
  ruleId: string;
  ruleName: string;
  metricName: string;
  labels: Record<string, string>;
  operator: string;
  threshold: number;
  actualValue: number;
  severity: "info" | "warning" | "critical";
  status: "firing" | "resolved";
  message: string;
  firedAt: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface HttpCheck {
  _id: string;
  userId: string;
  name: string;
  url: string;
  interval: number;
  expectedStatus: number;
  isActive: boolean;
  status: string;
  lastCheckedAt: string | null;
  lastResponseTime: number | null;
  lastStatusCode: number | null;
  sslExpiry: number | null;
  uptimePercent: number;
  results: HttpCheckResult[];
  createdAt: string;
  updatedAt: string;
}

export interface HttpCheckResult {
  timestamp: number;
  statusCode: number | null;
  responseTime: number;
  status: "up" | "down";
  sslDaysRemaining: number | null;
  error: string | null;
}

// ── TCP / Ping / DNS / Heartbeat (Phase 2) ──────────────────────────────
export interface TcpCheck {
  _id: string;
  userId: string;
  name: string;
  host: string;
  port: number;
  interval: number;        // ms
  timeoutMs: number;
  isActive: boolean;
  status: "up" | "down" | "pending";
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  uptimePercent: number;
  results: TcpCheckResult[];
  createdAt: string;
  updatedAt: string;
}

export interface TcpCheckResult {
  timestamp: number;
  status: "up" | "down";
  latencyMs: number;
  error: string | null;
}

export interface PingCheck {
  _id: string;
  userId: string;
  name: string;
  host: string;
  interval: number;        // ms
  isActive: boolean;
  status: "up" | "down" | "pending";
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  lastPacketLoss: number | null;
  lastError: string | null;
  uptimePercent: number;
  results: PingCheckResult[];
  createdAt: string;
  updatedAt: string;
}

export interface PingCheckResult {
  timestamp: number;
  status: "up" | "down";
  latencyMs: number;
  packetLoss: number;
  error: string | null;
}

export interface DnsCheck {
  _id: string;
  userId: string;
  name: string;
  domain: string;
  recordType: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SOA";
  /** Comma-separated list of expected values; empty string means "any resolution is a pass". */
  expected: string;
  interval: number;        // ms
  isActive: boolean;
  status: "up" | "down" | "pending";
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  lastValues: string[];
  lastError: string | null;
  uptimePercent: number;
  results: DnsCheckResult[];
  createdAt: string;
  updatedAt: string;
}

export interface DnsCheckResult {
  timestamp: number;
  status: "up" | "down";
  latencyMs: number;
  values: string[];
  error: string | null;
}

export interface HeartbeatMonitor {
  _id: string;
  userId: string;
  name: string;
  /** Public slug used in the ingest URL POST /api/heartbeat/:slug */
  slug: string;
  expectedEverySeconds: number;
  gracePeriodSeconds: number;
  lastPingAt: string | null;
  status: "up" | "down" | "pending";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}


// ── Unified event timeline (Phase 3) ───────────────────────────────────
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
  /** Originating subsystem — e.g. "metrics", "alerts", "http-checks", "agent". */
  source: string;
  severity: EventSeverity;
  title: string;
  detail: Record<string, unknown>;
}

// ── Incidents (Phase 3) ────────────────────────────────────────────────
export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
export type IncidentSeverity = "minor" | "major" | "critical" | "maintenance";

export interface IncidentRecord {
  _id: string;
  userId: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  services: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface IncidentUpdateRecord {
  _id: string;
  incidentId: string;
  status: IncidentStatus;
  message: string;
  createdAt: string;
}

export interface PipelineRecord {
  _id: string;
  userId: string;
  source: string;
  repo: string;
  branch: string;
  pipelineName: string;
  runId: string;
  runNumber: number;
  status: string;
  triggeredBy: string;
  commitSha: string;
  commitMessage: string;
  url: string;
  startedAt: string | null;
  finishedAt: string | null;
  duration?: number;
  stages: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NotificationChannel {
  _id: string;
  userId: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DockerContainer {
  _id: string;
  userId: string;
  serverId: string;
  containerId: string;
  name: string;
  image: string;
  status: string;
  state: string;
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memPercent: number;
  netRx: number;
  netTx: number;
  restarts: number;
  updatedAt: string;
}

export interface StatusPageConfig {
  userId: string;
  title: string;
  description: string;
  isPublic: boolean;
  customServices: Array<{ name: string; status: string; description?: string }>;
  /** Optional hostname (e.g. "status.example.com") that the public page
   *  should respond to. When set, `/public` endpoints only serve requests
   *  whose Host header matches — other hosts get 404. When empty, the page
   *  is served from any host. */
  customDomain?: string | null;
  updatedAt: string;
}

// Metric ingestion payload from agent
export interface MetricPayload {
  serverId: string;
  cpu: number;
  totalMem: number;
  freeMem: number;
  uptime?: number;
  loadAvg1?: number;
  loadAvg5?: number;
  loadAvg15?: number;
  diskTotal?: number;
  diskFree?: number;
  networkRx?: number;
  networkTx?: number;
  cpuCount?: number;
  platform?: string;
  arch?: string;
  hostname?: string;
  timestamp?: number;
  containers?: DockerContainerPayload[];
}

export interface DockerContainerPayload {
  containerId: string;
  name: string;
  image: string;
  status: string;
  state: string;
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memPercent: number;
  netRx: number;
  netTx: number;
  restarts: number;
}

// Alert fired event shape
export interface AlertFiredEvent {
  id: string;
  ruleName: string;
  metricName: string;
  severity: string;
  message: string;
  actualValue: number;
  threshold: number;
  firedAt: string;
  labels: Record<string, string>;
}

// Pipeline normalized shape
export interface NormalizedPipeline {
  source: string;
  repo: string;
  branch: string;
  pipelineName: string;
  runId: string;
  runNumber: number;
  status: string;
  triggeredBy: string;
  commitSha: string;
  commitMessage: string;
  url: string;
  startedAt: string | null;
  finishedAt: string | null;
  stages: string[];
}

// Fastify type augmentation
declare module "fastify" {
  interface FastifyInstance {
    io: import("socket.io").Server;
    store: typeof import("../store/index.js").default;
  }
  interface FastifyRequest {
    user: AuthContext;
  }
}
