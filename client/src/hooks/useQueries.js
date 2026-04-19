/**
 * TanStack Query hooks for API data fetching.
 * Replaces manual useEffect + useState + setInterval patterns.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchServers, fetchServer, fetchServerMetrics,
  updateServerName, deleteServer,
  fetchAllAlertRules, fetchServerAlertRules,
  createAlertRule, deleteAlertRule, toggleAlertRule,
  fetchAlertHistory, fetchActiveAlertCount,
  fetchCurrentUser, regenerateApiKey,
  fetchHttpChecks, fetchHttpCheck,
  createHttpCheck, deleteHttpCheck, toggleHttpCheck,
  fetchPipelines, fetchPipelineStats, deletePipeline,
  fetchNotificationChannels, createNotificationChannel,
  updateNotificationChannel, deleteNotificationChannel,
  toggleNotificationChannel, testNotificationChannel,
  fetchDockerContainers, fetchServerDockerContainers,
  fetchPublicStatus, fetchStatusPageConfig, updateStatusPageConfig,
} from "../services/api";

// ── Servers ──
export function useServers(refetchInterval = 15000) {
  return useQuery({
    queryKey: ["servers"],
    queryFn: fetchServers,
    refetchInterval,
  });
}

export function useServer(serverId) {
  return useQuery({
    queryKey: ["servers", serverId],
    queryFn: () => fetchServer(serverId),
    enabled: !!serverId,
  });
}

export function useServerMetrics(serverId, timeRange = "5m") {
  return useQuery({
    queryKey: ["serverMetrics", serverId, timeRange],
    queryFn: () => fetchServerMetrics(serverId, timeRange),
    enabled: !!serverId,
    refetchInterval: 30000,
  });
}

export function useUpdateServerName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, name }) => updateServerName(serverId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });
}

export function useDeleteServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serverId) => deleteServer(serverId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });
}

// ── Alert Rules ──
export function useAlertRules() {
  return useQuery({
    queryKey: ["alertRules"],
    queryFn: fetchAllAlertRules,
  });
}

export function useServerAlertRules(serverId) {
  return useQuery({
    queryKey: ["alertRules", serverId],
    queryFn: () => fetchServerAlertRules(serverId),
    enabled: !!serverId,
  });
}

export function useCreateAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAlertRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertRules"] }),
  });
}

export function useDeleteAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAlertRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertRules"] }),
  });
}

export function useToggleAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleAlertRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertRules"] }),
  });
}

// ── Alert History ──
export function useAlertHistory(params = {}) {
  return useQuery({
    queryKey: ["alertHistory", params],
    queryFn: () => fetchAlertHistory(params),
    refetchInterval: 30000,
  });
}

export function useActiveAlertCount() {
  return useQuery({
    queryKey: ["activeAlertCount"],
    queryFn: fetchActiveAlertCount,
    refetchInterval: 15000,
  });
}

// ── Auth ──
export function useCurrentUser() {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: fetchCurrentUser,
  });
}

export function useRegenerateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: regenerateApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["currentUser"] }),
  });
}

// ── HTTP Checks ──
export function useHttpChecks() {
  return useQuery({
    queryKey: ["httpChecks"],
    queryFn: fetchHttpChecks,
    refetchInterval: 30000,
  });
}

export function useHttpCheck(checkId) {
  return useQuery({
    queryKey: ["httpChecks", checkId],
    queryFn: () => fetchHttpCheck(checkId),
    enabled: !!checkId,
  });
}

export function useCreateHttpCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createHttpCheck,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["httpChecks"] }),
  });
}

export function useDeleteHttpCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteHttpCheck,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["httpChecks"] }),
  });
}

export function useToggleHttpCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleHttpCheck,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["httpChecks"] }),
  });
}

// ── Pipelines ──
export function usePipelines(params = {}) {
  return useQuery({
    queryKey: ["pipelines", params],
    queryFn: () => fetchPipelines(params),
    refetchInterval: 15000,
  });
}

export function usePipelineStats() {
  return useQuery({
    queryKey: ["pipelineStats"],
    queryFn: fetchPipelineStats,
    refetchInterval: 30000,
  });
}

export function useDeletePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePipeline,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

// ── Notifications ──
export function useNotificationChannels() {
  return useQuery({
    queryKey: ["notificationChannels"],
    queryFn: fetchNotificationChannels,
  });
}

export function useCreateNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createNotificationChannel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationChannels"] }),
  });
}

export function useUpdateNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, payload }) => updateNotificationChannel(channelId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationChannels"] }),
  });
}

export function useDeleteNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteNotificationChannel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationChannels"] }),
  });
}

export function useToggleNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleNotificationChannel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationChannels"] }),
  });
}

export function useTestNotificationChannel() {
  return useMutation({
    mutationFn: testNotificationChannel,
  });
}

// ── Docker ──
export function useDockerContainers() {
  return useQuery({
    queryKey: ["dockerContainers"],
    queryFn: fetchDockerContainers,
    refetchInterval: 15000,
  });
}

export function useServerDockerContainers(serverId) {
  return useQuery({
    queryKey: ["dockerContainers", serverId],
    queryFn: () => fetchServerDockerContainers(serverId),
    enabled: !!serverId,
    refetchInterval: 15000,
  });
}

// ── Status Page ──
export function usePublicStatus() {
  return useQuery({
    queryKey: ["publicStatus"],
    queryFn: fetchPublicStatus,
    refetchInterval: 30000,
  });
}

export function useStatusPageConfig() {
  return useQuery({
    queryKey: ["statusPageConfig"],
    queryFn: fetchStatusPageConfig,
  });
}

export function useUpdateStatusPageConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateStatusPageConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["statusPageConfig"] }),
  });
}
