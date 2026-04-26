/**
 * Zustand store for Socket.IO real-time data.
 * Single connection shared across all components.
 */
import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { API_BASE_URL } from "../services/api";
import useAuthStore from "./authStore";
import type {
  MetricSnapshot, AlertHistoryEntry, HttpCheckResult, Pipeline, DockerContainer,
  TcpCheckResult, PingCheckResult, DnsCheckResult, HeartbeatEvent,
  EventRecord, AnomalyEvent, Incident, PluginResultEvent,
} from "../types";

interface SocketState {
  connected: boolean;
  allServerMetrics: Record<string, MetricSnapshot>;
  alerts: AlertHistoryEntry[];
  httpCheckResults: Record<string, HttpCheckResult>;
  tcpCheckResults: Record<string, TcpCheckResult>;
  pingCheckResults: Record<string, PingCheckResult>;
  dnsCheckResults: Record<string, DnsCheckResult>;
  heartbeatEvents: Record<string, HeartbeatEvent & { status: "up" | "down" }>;
  pipelineUpdates: Pipeline[];
  dockerMetrics: Record<string, DockerContainer[]>;
  events: EventRecord[];
  anomalies: Record<string, AnomalyEvent[]>; // keyed by `${serverId}:${metric}`
  incidents: Incident[];
  pluginResults: Record<string, PluginResultEvent>;
  // Filtered ring buffer of recent metric snapshots for the currently
  // focused server (the ServerDetail page). Capped at 300 points.
  liveData: MetricSnapshot[];
  selectedServerId: string;
  socket: Socket | null;

  connect: () => void;
  disconnect: () => void;
  clearAlerts: () => void;
  setSelectedServerId: (id: string) => void;
  resetStream: () => void;
}

const useSocketStore = create<SocketState>((set, get) => ({
  connected: false,
  allServerMetrics: {},
  alerts: [],
  httpCheckResults: {},
  tcpCheckResults: {},
  pingCheckResults: {},
  dnsCheckResults: {},
  heartbeatEvents: {},
  pipelineUpdates: [],
  dockerMetrics: {},
  events: [],
  anomalies: {},
  incidents: [],
  pluginResults: {},
  liveData: [],
  selectedServerId: "",
  socket: null,

  connect() {
    if (get().socket) return;
    const token = useAuthStore.getState().getAccessToken();
    if (!token) return; // Do not open an unauthenticated socket.

    const socket = io(API_BASE_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      // Cap retries so an expired/revoked token doesn't reconnect forever.
      reconnectionAttempts: 10,
      auth: { token },
    });

    socket.on("connect", () => set({ connected: true }));
    socket.on("disconnect", () => set({ connected: false }));

    // Auth errors from the server-side io.use() middleware arrive as
    // connect_error with message "unauthorized". Force a logout so the user
    // is redirected to /login instead of retrying with a stale token.
    socket.on("connect_error", (err: Error) => {
      if (err.message === "unauthorized") {
        socket.disconnect();
        set({ socket: null, connected: false });
        useAuthStore.getState().clear();
      }
    });

    socket.on("metrics", (data: MetricSnapshot) => {
      set((state) => {
        const next: Partial<SocketState> = {
          allServerMetrics: { ...state.allServerMetrics, [data.serverId]: data },
        };
        // Append to the per-server ring buffer when this snapshot is for
        // the currently focused server.
        if (state.selectedServerId && data.serverId === state.selectedServerId) {
          next.liveData = [...state.liveData.slice(-299), data];
        }
        return next;
      });
    });

    socket.on("alert:fired", (alert: AlertHistoryEntry) => {
      set((state) => ({
        alerts: [alert, ...state.alerts].slice(0, 50),
      }));
    });

    socket.on("alert:resolved", (alert: Pick<AlertHistoryEntry, "_id" | "status" | "message">) => {
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a._id === alert._id ? { ...a, status: "resolved" as const, message: alert.message } : a,
        ),
      }));
    });

    socket.on("httpcheck:result", (result: HttpCheckResult) => {
      set((state) => ({
        httpCheckResults: { ...state.httpCheckResults, [result.checkId]: result },
      }));
    });

    socket.on("tcpcheck:result", (result: TcpCheckResult) => {
      set((state) => ({
        tcpCheckResults: { ...state.tcpCheckResults, [result.checkId]: result },
      }));
    });

    socket.on("pingcheck:result", (result: PingCheckResult) => {
      set((state) => ({
        pingCheckResults: { ...state.pingCheckResults, [result.checkId]: result },
      }));
    });

    socket.on("dnscheck:result", (result: DnsCheckResult) => {
      set((state) => ({
        dnsCheckResults: { ...state.dnsCheckResults, [result.checkId]: result },
      }));
    });

    socket.on("plugin:result", (result: PluginResultEvent) => {
      set((state) => ({
        pluginResults: { ...state.pluginResults, [result.instanceId]: result },
      }));
    });

    socket.on("heartbeat:ping", (e: HeartbeatEvent) => {
      set((state) => ({
        heartbeatEvents: { ...state.heartbeatEvents, [e.monitorId]: { ...e, status: "up" } },
      }));
    });
    socket.on("heartbeat:missed", (e: HeartbeatEvent) => {
      set((state) => ({
        heartbeatEvents: { ...state.heartbeatEvents, [e.monitorId]: { ...e, status: "down" } },
      }));
    });
    socket.on("heartbeat:recovered", (e: HeartbeatEvent) => {
      set((state) => ({
        heartbeatEvents: { ...state.heartbeatEvents, [e.monitorId]: { ...e, status: "up" } },
      }));
    });

    socket.on("pipeline:update", (pipeline: Pipeline) => {
      set((state) => ({
        pipelineUpdates: [pipeline, ...state.pipelineUpdates].slice(0, 50),
      }));
    });

    socket.on("docker:metrics", (data: { serverId: string; containers: DockerContainer[] }) => {
      set((state) => ({
        dockerMetrics: { ...state.dockerMetrics, [data.serverId]: data.containers },
      }));
    });

    // ── Phase 3: timeline events, anomalies, incidents ──
    socket.on("event", (record: EventRecord) => {
      set((state) => ({ events: [record, ...state.events].slice(0, 500) }));
    });

    socket.on("anomaly", (a: AnomalyEvent) => {
      const key = `${a.serverId}:${a.metric}`;
      set((state) => {
        const prev = state.anomalies[key] ?? [];
        const next = [a, ...prev].slice(0, 100);
        return { anomalies: { ...state.anomalies, [key]: next } };
      });
    });

    socket.on("incident:created", (incident: Incident) => {
      set((state) => ({ incidents: [incident, ...state.incidents.filter((i) => i._id !== incident._id)] }));
    });

    socket.on("incident:updated", (incident: Incident) => {
      set((state) => ({
        incidents: state.incidents.map((i) => (i._id === incident._id ? incident : i)),
      }));
    });

    set({ socket });
  },

  disconnect() {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },

  clearAlerts() {
    set({ alerts: [] });
  },

  setSelectedServerId(id: string) {
    // Switching server resets the live ring buffer so the new ServerDetail
    // page doesn't render points from the previously focused host.
    set({ selectedServerId: id, liveData: [] });
  },

  resetStream() {
    set({ liveData: [] });
  },
}));

export default useSocketStore;
