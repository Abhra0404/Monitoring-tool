/**
 * TanStack Query hooks for all API data fetching.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TimeRange } from "../types";
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
import type { AlertRule, HttpCheck, NotificationChannel, StatusPageConfig } from "../types";

// ── Servers ──
export function useServers(refetchInterval = 15000) {
  return useQuery({ queryKey: ["servers"], queryFn: fetchServers, refetchInterval });
}

export function useServer(serverId: string) {
  return useQuery({
    queryKey: ["servers", serverId],
    queryFn: () => fetchServer(serverId),
    enabled: !!serverId,
  });
}

export function useServerMetrics(serverId: string, timeRange: TimeRange = "5m") {
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
    mutationFn: ({ serverId, name }: { serverId: string; name: string }) =>
      updateServerName(serverId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });
}

export function useDeleteServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => deleteServer(serverId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });
}

// ── Alert Rules ──
export function useAlertRules() {
  return useQuery({ queryKey: ["alertRules"], queryFn: fetchAllAlertRules });
}

export function useServerAlertRules(serverId: string) {
  return useQuery({
    queryKey: ["alertRules", serverId],
    queryFn: () => fetchServerAlertRules(serverId),
    enabled: !!serverId,
  });
}

export function useCreateAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<AlertRule, "_id">) => createAlertRule(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertRules"] }),
  });
}

export function useDeleteAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => deleteAlertRule(ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertRules"] }),
  });
}

export function useToggleAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => toggleAlertRule(ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertRules"] }),
  });
}

// ── Alert History ──
export function useAlertHistory(params: Record<string, string | number> = {}) {
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
  return useQuery({ queryKey: ["currentUser"], queryFn: fetchCurrentUser });
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

export function useHttpCheck(checkId: string) {
  return useQuery({
    queryKey: ["httpChecks", checkId],
    queryFn: () => fetchHttpCheck(checkId),
    enabled: !!checkId,
  });
}

export function useCreateHttpCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Pick<HttpCheck, "name" | "url" | "interval" | "expectedStatus">) =>
      createHttpCheck(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["httpChecks"] }),
  });
}

export function useDeleteHttpCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkId: string) => deleteHttpCheck(checkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["httpChecks"] }),
  });
}

export function useToggleHttpCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkId: string) => toggleHttpCheck(checkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["httpChecks"] }),
  });
}

// ── Pipelines ──
export function usePipelines(params: Record<string, string | number> = {}) {
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
    mutationFn: (runId: string) => deletePipeline(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

// ── Notifications ──
export function useNotificationChannels() {
  return useQuery({ queryKey: ["notificationChannels"], queryFn: fetchNotificationChannels });
}

export function useCreateNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<NotificationChannel, "_id">) => createNotificationChannel(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationChannels"] }),
  });
}

export function useUpdateNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, payload }: { channelId: string; payload: Partial<NotificationChannel> }) =>
      updateNotificationChannel(channelId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationChannels"] }),
  });
}

export function useDeleteNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => deleteNotificationChannel(channelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationChannels"] }),
  });
}

export function useToggleNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => toggleNotificationChannel(channelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationChannels"] }),
  });
}

export function useTestNotificationChannel() {
  return useMutation({ mutationFn: (channelId: string) => testNotificationChannel(channelId) });
}

// ── Docker ──
export function useDockerContainers() {
  return useQuery({
    queryKey: ["dockerContainers"],
    queryFn: fetchDockerContainers,
    refetchInterval: 15000,
  });
}

export function useServerDockerContainers(serverId: string) {
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
  return useQuery({ queryKey: ["statusPageConfig"], queryFn: fetchStatusPageConfig });
}

export function useUpdateStatusPageConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<StatusPageConfig>) => updateStatusPageConfig(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["statusPageConfig"] }),
  });
}
