import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// ── Servers ────────────────────────────────────────────────────────────
export async function fetchServers() {
  const { data } = await apiClient.get("/api/servers");
  return data;
}

export async function fetchServer(serverId) {
  const { data } = await apiClient.get(`/api/servers/${serverId}`);
  return data;
}

export async function fetchServerMetrics(serverId, timeRange = "5m") {
  const { data } = await apiClient.get(`/api/servers/${serverId}/metrics`, {
    params: { timeRange },
  });
  return data;
}

export async function updateServerName(serverId, name) {
  const { data } = await apiClient.put(`/api/servers/${serverId}`, { name });
  return data;
}

export async function deleteServer(serverId) {
  const { data } = await apiClient.delete(`/api/servers/${serverId}`);
  return data;
}

// ── Alert Rules ────────────────────────────────────────────────────────
export async function fetchAllAlertRules() {
  const { data } = await apiClient.get("/api/alerts/rules");
  return data;
}

export async function fetchServerAlertRules(serverId) {
  const { data } = await apiClient.get(`/api/servers/${serverId}/alert-rules`);
  return data;
}

export async function createAlertRule(payload) {
  const { data } = await apiClient.post("/api/alerts/rules", payload);
  return data;
}

export async function deleteAlertRule(ruleId) {
  const { data } = await apiClient.delete(`/api/alerts/rules/${ruleId}`);
  return data;
}

export async function toggleAlertRule(ruleId) {
  const { data } = await apiClient.patch(`/api/alerts/rules/${ruleId}/toggle`);
  return data;
}

// ── Alert History ──────────────────────────────────────────────────────
export async function fetchAlertHistory(params = {}) {
  const { data } = await apiClient.get("/api/alerts/history", { params });
  return data;
}

export async function fetchActiveAlertCount() {
  const { data } = await apiClient.get("/api/alerts/active-count");
  return data.count;
}

// ── System User/API Key ───────────────────────────────────────────────
export async function fetchCurrentUser() {
  const { data } = await apiClient.get("/api/auth/me");
  return data.user;
}

export async function regenerateApiKey() {
  const { data } = await apiClient.post("/api/auth/regenerate-key");
  return data;
}

// ── Health ──────────────────────────────────────────────────────────────
export async function fetchHealth() {
  const { data } = await apiClient.get("/health");
  return data;
}

// ── HTTP Checks ────────────────────────────────────────────────────────
export async function fetchHttpChecks() {
  const { data } = await apiClient.get("/api/http-checks");
  return data;
}

export async function fetchHttpCheck(checkId) {
  const { data } = await apiClient.get(`/api/http-checks/${checkId}`);
  return data;
}

export async function createHttpCheck(payload) {
  const { data } = await apiClient.post("/api/http-checks", payload);
  return data;
}

export async function deleteHttpCheck(checkId) {
  const { data } = await apiClient.delete(`/api/http-checks/${checkId}`);
  return data;
}

export async function toggleHttpCheck(checkId) {
  const { data } = await apiClient.patch(`/api/http-checks/${checkId}/toggle`);
  return data;
}

// ── Pipelines ─────────────────────────────────────────────────────────
export async function fetchPipelines(params = {}) {
  const { data } = await apiClient.get("/api/pipelines", { params });
  return data;
}

export async function fetchPipelineStats() {
  const { data } = await apiClient.get("/api/pipelines/stats");
  return data;
}

export async function deletePipeline(runId) {
  const { data } = await apiClient.delete(`/api/pipelines/${runId}`);
  return data;
}

// ── Notification Channels ─────────────────────────────────────────────
export async function fetchNotificationChannels() {
  const { data } = await apiClient.get("/api/notifications/channels");
  return data;
}

export async function createNotificationChannel(payload) {
  const { data } = await apiClient.post("/api/notifications/channels", payload);
  return data;
}

export async function updateNotificationChannel(channelId, payload) {
  const { data } = await apiClient.put(`/api/notifications/channels/${channelId}`, payload);
  return data;
}

export async function deleteNotificationChannel(channelId) {
  const { data } = await apiClient.delete(`/api/notifications/channels/${channelId}`);
  return data;
}

export async function toggleNotificationChannel(channelId) {
  const { data } = await apiClient.patch(`/api/notifications/channels/${channelId}/toggle`);
  return data;
}

export async function testNotificationChannel(channelId) {
  const { data } = await apiClient.post(`/api/notifications/channels/${channelId}/test`);
  return data;
}

// ── Docker ─────────────────────────────────────────────────────────────
export async function fetchDockerContainers() {
  const { data } = await apiClient.get("/api/docker");
  return data;
}

export async function fetchServerDockerContainers(serverId) {
  const { data } = await apiClient.get(`/api/docker/${serverId}`);
  return data;
}

// ── Status Page ────────────────────────────────────────────────────────
export async function fetchPublicStatus() {
  const { data } = await apiClient.get("/api/status-page/public");
  return data;
}

export async function fetchStatusPageConfig() {
  const { data } = await apiClient.get("/api/status-page/config");
  return data;
}

export async function updateStatusPageConfig(payload) {
  const { data } = await apiClient.put("/api/status-page/config", payload);
  return data;
}

export { API_BASE_URL };
