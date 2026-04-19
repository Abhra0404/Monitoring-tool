// ── Shared types used across all server modules ──

export interface SystemUser {
  _id: string;
  email: string;
  password: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
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
    user: SystemUser;
  }
}
