import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
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

// ── Health ──────────────────────────────────────────────────────────────
export async function fetchHealth() {
  const { data } = await apiClient.get("/health");
  return data;
}

export { API_BASE_URL };
