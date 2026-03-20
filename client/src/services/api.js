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

export async function fetchServers() {
  const response = await apiClient.get("/api/servers");
  return response.data;
}

export async function fetchServerMetrics(serverId, timeRange = "5m") {
  const response = await apiClient.get(`/api/servers/${serverId}/metrics`, {
    params: { timeRange },
  });

  return response.data;
}

export async function fetchAlertRule(serverId) {
  const response = await apiClient.get(`/api/servers/${serverId}/alert-rules`);
  return response.data;
}

export async function updateAlertRule(serverId, payload) {
  const response = await apiClient.put(
    `/api/servers/${serverId}/alert-rules`,
    payload
  );

  return response.data;
}

export { API_BASE_URL };
