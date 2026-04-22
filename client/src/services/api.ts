import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import type {
  ServerRecord, MetricSnapshot, AlertRule, AlertHistoryEntry,
  HttpCheck, Pipeline, PipelineStats, NotificationChannel,
  DockerContainer, StatusPageConfig, PublicStatus, SystemUser,
  TimeRange,
  TcpCheck, PingCheck, DnsCheck, DnsRecordType, HeartbeatMonitor,
} from "../types";
import useAuthStore, { type AuthUser } from "../stores/authStore";

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "";

const apiClient = axios.create({ baseURL: API_BASE_URL });

// ── Auth interceptors ──────────────────────────────────────────────────
// Attach access token to every request.
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, attempt a single refresh then replay the original request.
let refreshInFlight: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = useAuthStore.getState().getRefreshToken();
    if (!refreshToken) return null;
    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/api/auth/refresh`,
        { refreshToken },
      );
      useAuthStore.getState().setTokens(
        data.user as AuthUser,
        data.accessToken as string,
        data.refreshToken as string,
      );
      return data.accessToken as string;
    } catch {
      useAuthStore.getState().clear();
      return null;
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

apiClient.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const url = original?.url ?? "";
    // Do not loop when the failing request is the refresh endpoint itself,
    // or an auth endpoint where 401 is the expected "bad credentials" signal.
    const isAuthPath =
      url.includes("/api/auth/login") ||
      url.includes("/api/auth/register") ||
      url.includes("/api/auth/refresh");
    if (err.response?.status === 401 && !original?._retried && !isAuthPath) {
      original._retried = true;
      const newToken = await attemptRefresh();
      if (newToken) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        return apiClient.request(original);
      }
    }
    return Promise.reject(err);
  },
);

// ── Auth endpoints ─────────────────────────────────────────────────────
export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresAt: string;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/api/auth/login", { email, password });
  return data;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/api/auth/register", { email, password });
  return data;
}

export async function logout(): Promise<void> {
  const refreshToken = useAuthStore.getState().getRefreshToken();
  if (refreshToken) {
    try {
      await apiClient.post("/api/auth/logout", { refreshToken });
    } catch {
      /* best-effort — session is cleared regardless */
    }
  }
  useAuthStore.getState().clear();
}

// ── Servers ────────────────────────────────────────────────────────────
export async function fetchServers(): Promise<ServerRecord[]> {
  const { data } = await apiClient.get<ServerRecord[]>("/api/servers/");
  return data;
}

export async function fetchServer(serverId: string): Promise<ServerRecord> {
  const { data } = await apiClient.get<ServerRecord>(`/api/servers/${serverId}`);
  return data;
}

export async function fetchServerMetrics(serverId: string, timeRange: TimeRange = "5m"): Promise<MetricSnapshot[]> {
  const { data } = await apiClient.get<MetricSnapshot[]>(`/api/servers/${serverId}/metrics`, {
    params: { timeRange },
  });
  return data;
}

export async function updateServerName(serverId: string, name: string): Promise<ServerRecord> {
  const { data } = await apiClient.put<ServerRecord>(`/api/servers/${serverId}`, { name });
  return data;
}

export async function deleteServer(serverId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(`/api/servers/${serverId}`);
  return data;
}

// ── Alert Rules ────────────────────────────────────────────────────────
export async function fetchAllAlertRules(): Promise<AlertRule[]> {
  const { data } = await apiClient.get<AlertRule[]>("/api/alerts/rules");
  return data;
}

export async function fetchServerAlertRules(serverId: string): Promise<AlertRule[]> {
  const { data } = await apiClient.get<AlertRule[]>(`/api/servers/${serverId}/alert-rules`);
  return data;
}

export async function createAlertRule(payload: Omit<AlertRule, "_id">): Promise<AlertRule> {
  const { data } = await apiClient.post<AlertRule>("/api/alerts/rules", payload);
  return data;
}

export async function deleteAlertRule(ruleId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(`/api/alerts/rules/${ruleId}`);
  return data;
}

export async function toggleAlertRule(ruleId: string): Promise<AlertRule> {
  const { data } = await apiClient.patch<AlertRule>(`/api/alerts/rules/${ruleId}/toggle`);
  return data;
}

// ── Alert History ──────────────────────────────────────────────────────
export async function fetchAlertHistory(params: Record<string, string | number> = {}): Promise<AlertHistoryEntry[]> {
  const { data } = await apiClient.get<AlertHistoryEntry[]>("/api/alerts/history", { params });
  return data;
}

export async function fetchActiveAlertCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>("/api/alerts/active-count");
  return data.count;
}

// ── System User/API Key ────────────────────────────────────────────────
export async function fetchCurrentUser(): Promise<SystemUser> {
  const { data } = await apiClient.get<{ user: SystemUser }>("/api/auth/me");
  return data.user;
}

export async function regenerateApiKey(): Promise<{ apiKey: string; message: string }> {
  const { data } = await apiClient.post<{ apiKey: string; message: string }>("/api/auth/regenerate-key");
  return data;
}

// ── Health ─────────────────────────────────────────────────────────────
export async function fetchHealth(): Promise<{ status: string; uptime: number; storage: string }> {
  const { data } = await apiClient.get<{ status: string; uptime: number; storage: string }>("/health");
  return data;
}

// ── HTTP Checks ────────────────────────────────────────────────────────
export async function fetchHttpChecks(): Promise<HttpCheck[]> {
  const { data } = await apiClient.get<HttpCheck[]>("/api/http-checks/");
  return data;
}

export async function fetchHttpCheck(checkId: string): Promise<HttpCheck> {
  const { data } = await apiClient.get<HttpCheck>(`/api/http-checks/${checkId}`);
  return data;
}

export async function createHttpCheck(payload: Pick<HttpCheck, "name" | "url" | "interval" | "expectedStatus">): Promise<HttpCheck> {
  const { data } = await apiClient.post<HttpCheck>("/api/http-checks/", payload);
  return data;
}

export async function deleteHttpCheck(checkId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(`/api/http-checks/${checkId}`);
  return data;
}

export async function toggleHttpCheck(checkId: string): Promise<HttpCheck> {
  const { data } = await apiClient.patch<HttpCheck>(`/api/http-checks/${checkId}/toggle`);
  return data;
}

// ── TCP Checks ────────────────────────────────────────────────────────
export async function fetchTcpChecks(): Promise<TcpCheck[]> {
  const { data } = await apiClient.get<TcpCheck[]>("/api/tcp-checks/");
  return data;
}
export async function createTcpCheck(payload: { name: string; host: string; port: number; interval?: number; timeoutMs?: number }): Promise<TcpCheck> {
  const { data } = await apiClient.post<TcpCheck>("/api/tcp-checks/", payload);
  return data;
}
export async function deleteTcpCheck(checkId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(`/api/tcp-checks/${checkId}`);
  return data;
}
export async function toggleTcpCheck(checkId: string): Promise<TcpCheck> {
  const { data } = await apiClient.patch<TcpCheck>(`/api/tcp-checks/${checkId}/toggle`);
  return data;
}

// ── Ping Checks ───────────────────────────────────────────────────────
export async function fetchPingChecks(): Promise<PingCheck[]> {
  const { data } = await apiClient.get<PingCheck[]>("/api/ping-checks/");
  return data;
}
export async function createPingCheck(payload: { name: string; host: string; interval?: number }): Promise<PingCheck> {
  const { data } = await apiClient.post<PingCheck>("/api/ping-checks/", payload);
  return data;
}
export async function deletePingCheck(checkId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(`/api/ping-checks/${checkId}`);
  return data;
}
export async function togglePingCheck(checkId: string): Promise<PingCheck> {
  const { data } = await apiClient.patch<PingCheck>(`/api/ping-checks/${checkId}/toggle`);
  return data;
}

// ── DNS Checks ────────────────────────────────────────────────────────
export async function fetchDnsChecks(): Promise<DnsCheck[]> {
  const { data } = await apiClient.get<DnsCheck[]>("/api/dns-checks/");
  return data;
}
export async function createDnsCheck(payload: { name: string; domain: string; recordType: DnsRecordType; expected?: string; interval?: number }): Promise<DnsCheck> {
  const { data } = await apiClient.post<DnsCheck>("/api/dns-checks/", payload);
  return data;
}
export async function deleteDnsCheck(checkId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(`/api/dns-checks/${checkId}`);
  return data;
}
export async function toggleDnsCheck(checkId: string): Promise<DnsCheck> {
  const { data } = await apiClient.patch<DnsCheck>(`/api/dns-checks/${checkId}/toggle`);
  return data;
}

// ── Heartbeat Monitors ────────────────────────────────────────────────
export async function fetchHeartbeats(): Promise<HeartbeatMonitor[]> {
  const { data } = await apiClient.get<HeartbeatMonitor[]>("/api/heartbeats/");
  return data;
}
export async function createHeartbeat(payload: { name: string; slug: string; expectedEverySeconds: number; gracePeriodSeconds?: number }): Promise<HeartbeatMonitor> {
  const { data } = await apiClient.post<HeartbeatMonitor>("/api/heartbeats/", payload);
  return data;
}
export async function deleteHeartbeat(monitorId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(`/api/heartbeats/${monitorId}`);
  return data;
}
export async function toggleHeartbeat(monitorId: string): Promise<HeartbeatMonitor> {
  const { data } = await apiClient.patch<HeartbeatMonitor>(`/api/heartbeats/${monitorId}/toggle`);
  return data;
}

// ── Agent onboarding ──────────────────────────────────────────────────
export async function createOnboardingToken(payload: { baseUrl?: string; serverId?: string } = {}): Promise<{ token: string; url: string; expiresIn: number }> {
  const { data } = await apiClient.post<{ token: string; url: string; expiresIn: number }>("/api/auth/onboarding-token", payload);
  return data;
}

// ── Pipelines ─────────────────────────────────────────────────────────
export async function fetchPipelines(params: Record<string, string | number> = {}): Promise<Pipeline[]> {
  const { data } = await apiClient.get<Pipeline[]>("/api/pipelines/", { params });
  return data;
}

export async function fetchPipelineStats(): Promise<PipelineStats> {
  const { data } = await apiClient.get<PipelineStats>("/api/pipelines/stats");
  return data;
}

export async function deletePipeline(runId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(`/api/pipelines/${runId}`);
  return data;
}

// ── Notification Channels ─────────────────────────────────────────────
export async function fetchNotificationChannels(): Promise<NotificationChannel[]> {
  const { data } = await apiClient.get<NotificationChannel[]>("/api/notifications/channels");
  return data;
}

export async function createNotificationChannel(payload: Omit<NotificationChannel, "_id">): Promise<NotificationChannel> {
  const { data } = await apiClient.post<NotificationChannel>("/api/notifications/channels", payload);
  return data;
}

export async function updateNotificationChannel(channelId: string, payload: Partial<NotificationChannel>): Promise<NotificationChannel> {
  const { data } = await apiClient.put<NotificationChannel>(`/api/notifications/channels/${channelId}`, payload);
  return data;
}

export async function deleteNotificationChannel(channelId: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(`/api/notifications/channels/${channelId}`);
  return data;
}

export async function toggleNotificationChannel(channelId: string): Promise<NotificationChannel> {
  const { data } = await apiClient.patch<NotificationChannel>(`/api/notifications/channels/${channelId}/toggle`);
  return data;
}

export async function testNotificationChannel(channelId: string): Promise<{ success: boolean; message?: string }> {
  const { data } = await apiClient.post<{ success: boolean; message?: string }>(`/api/notifications/channels/${channelId}/test`);
  return data;
}

// ── Docker ─────────────────────────────────────────────────────────────
export async function fetchDockerContainers(): Promise<DockerContainer[]> {
  const { data } = await apiClient.get<DockerContainer[]>("/api/docker/");
  return data;
}

export async function fetchServerDockerContainers(serverId: string): Promise<DockerContainer[]> {
  const { data } = await apiClient.get<DockerContainer[]>(`/api/docker/${serverId}`);
  return data;
}

// ── Status Page ────────────────────────────────────────────────────────
export async function fetchPublicStatus(): Promise<PublicStatus> {
  const { data } = await apiClient.get<PublicStatus>("/api/status-page/public");
  return data;
}

export async function fetchStatusPageConfig(): Promise<StatusPageConfig> {
  const { data } = await apiClient.get<StatusPageConfig>("/api/status-page/config");
  return data;
}

export async function updateStatusPageConfig(payload: Partial<StatusPageConfig>): Promise<StatusPageConfig> {
  const { data } = await apiClient.put<StatusPageConfig>("/api/status-page/config", payload);
  return data;
}

// ── Events (Phase 3) ───────────────────────────────────────────────────
export async function fetchEvents(params: {
  cursor?: string | null;
  limit?: number;
  kinds?: string[];
  source?: string;
  since?: number | null;
} = {}): Promise<import("../types").EventListResponse> {
  const q: Record<string, string | number> = {};
  if (params.cursor) q.cursor = params.cursor;
  if (params.limit) q.limit = params.limit;
  if (params.kinds && params.kinds.length) q.kinds = params.kinds.join(",");
  if (params.source) q.source = params.source;
  if (params.since) q.since = params.since;
  const { data } = await apiClient.get<import("../types").EventListResponse>("/api/events/", { params: q });
  return data;
}

export async function fetchCorrelatedEvents(time: number, windowMs = 10 * 60 * 1000): Promise<import("../types").EventRecord[]> {
  const { data } = await apiClient.get<{ items: import("../types").EventRecord[] }>("/api/events/correlate", {
    params: { time: String(time), windowMs },
  });
  return data.items;
}

// ── Incidents (Phase 3) ────────────────────────────────────────────────
export async function fetchIncidents(): Promise<import("../types").Incident[]> {
  const { data } = await apiClient.get<import("../types").Incident[]>("/api/incidents/");
  return data;
}

export async function fetchIncident(id: string): Promise<import("../types").Incident> {
  const { data } = await apiClient.get<import("../types").Incident>(`/api/incidents/${id}`);
  return data;
}

export async function createIncident(payload: {
  title: string;
  message: string;
  status?: import("../types").IncidentStatus;
  severity?: import("../types").IncidentSeverity;
  services?: string[];
}): Promise<import("../types").Incident> {
  const { data } = await apiClient.post<import("../types").Incident>("/api/incidents/", payload);
  return data;
}

export async function appendIncidentUpdate(id: string, payload: {
  status?: import("../types").IncidentStatus;
  message: string;
}): Promise<import("../types").Incident> {
  const { data } = await apiClient.post<import("../types").Incident>(`/api/incidents/${id}/updates`, payload);
  return data;
}

export async function updateIncident(id: string, payload: {
  title?: string;
  severity?: import("../types").IncidentSeverity;
  services?: string[];
}): Promise<import("../types").Incident> {
  const { data } = await apiClient.put<import("../types").Incident>(`/api/incidents/${id}`, payload);
  return data;
}

export async function deleteIncident(id: string): Promise<void> {
  await apiClient.delete(`/api/incidents/${id}`);
}

// ── Status-page Phase 3 extras ─────────────────────────────────────────
export async function fetchUptimeHistory(days = 90): Promise<{ days: number; checks: import("../types").UptimeSeries[] }> {
  const { data } = await apiClient.get<{ days: number; checks: import("../types").UptimeSeries[] }>("/api/status-page/public/uptime", { params: { days } });
  return data;
}

export async function fetchActivePublicIncidents(): Promise<{ items: import("../types").Incident[] }> {
  const { data } = await apiClient.get<{ items: import("../types").Incident[] }>("/api/incidents/public/active");
  return data;
}

// ── Phase 4: Plugin system ────────────────────────────────────────────
import type {
  PluginsListResponse, PluginInstanceRecord, PluginRunResult,
} from "../types";

export async function fetchPlugins(): Promise<PluginsListResponse> {
  const { data } = await apiClient.get<PluginsListResponse>("/api/plugins/");
  return data;
}

export async function installPlugin(pkg: string): Promise<{ name: string; version: string; type: string }> {
  const { data } = await apiClient.post<{ name: string; version: string; type: string }>(
    "/api/plugins/install", { package: pkg },
  );
  return data;
}

export async function uninstallPlugin(name: string): Promise<void> {
  await apiClient.delete(`/api/plugins/${encodeURIComponent(name)}`);
}

export async function createPluginInstance(body: {
  name: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}): Promise<PluginInstanceRecord> {
  const { data } = await apiClient.post<PluginInstanceRecord>("/api/plugins/instances", body);
  return data;
}

export async function updatePluginInstance(
  id: string,
  body: { config?: Record<string, unknown>; enabled?: boolean },
): Promise<PluginInstanceRecord> {
  const { data } = await apiClient.put<PluginInstanceRecord>(`/api/plugins/instances/${id}`, body);
  return data;
}

export async function deletePluginInstance(id: string): Promise<void> {
  await apiClient.delete(`/api/plugins/instances/${id}`);
}

export async function runPluginInstance(id: string): Promise<PluginRunResult> {
  const { data } = await apiClient.post<PluginRunResult>(`/api/plugins/instances/${id}/run`, {});
  return data;
}
