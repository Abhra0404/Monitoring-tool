import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { API_BASE_URL } from "../services/api";
import type {
  MetricSnapshot, AlertHistoryEntry, HttpCheckResult, Pipeline, DockerContainer,
  TcpCheckResult, PingCheckResult, DnsCheckResult, HeartbeatEvent,
  EventRecord, AnomalyEvent, Incident, PluginResultEvent,
} from "../types";

interface UseSocketReturn {
  liveData: MetricSnapshot[];
  alerts: AlertHistoryEntry[];
  connected: boolean;
  allServerMetrics: Record<string, MetricSnapshot>;
  httpCheckResults: Record<string, HttpCheckResult>;
  tcpCheckResults: Record<string, TcpCheckResult>;
  pingCheckResults: Record<string, PingCheckResult>;
  dnsCheckResults: Record<string, DnsCheckResult>;
  heartbeatEvents: Record<string, HeartbeatEvent & { status: "up" | "down" }>;
  pipelineUpdates: Pipeline[];
  dockerMetrics: Record<string, DockerContainer[]>;
  events: EventRecord[];
  anomalies: Record<string, AnomalyEvent[]>;
  incidents: Incident[];
  pluginResults: Record<string, PluginResultEvent>;
  resetStream: () => void;
  clearAlerts: () => void;
}

function useSocket(selectedServerId: string): UseSocketReturn {
  const [liveData, setLiveData] = useState<MetricSnapshot[]>([]);
  const [alerts, setAlerts] = useState<AlertHistoryEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [allServerMetrics, setAllServerMetrics] = useState<Record<string, MetricSnapshot>>({});
  const [httpCheckResults, setHttpCheckResults] = useState<Record<string, HttpCheckResult>>({});
  const [tcpCheckResults, setTcpCheckResults] = useState<Record<string, TcpCheckResult>>({});
  const [pingCheckResults, setPingCheckResults] = useState<Record<string, PingCheckResult>>({});
  const [dnsCheckResults, setDnsCheckResults] = useState<Record<string, DnsCheckResult>>({});
  const [heartbeatEvents, setHeartbeatEvents] = useState<Record<string, HeartbeatEvent & { status: "up" | "down" }>>({});
  const [pipelineUpdates, setPipelineUpdates] = useState<Pipeline[]>([]);
  const [dockerMetrics, setDockerMetrics] = useState<Record<string, DockerContainer[]>>({});
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [anomalies, setAnomalies] = useState<Record<string, AnomalyEvent[]>>({});
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [pluginResults, setPluginResults] = useState<Record<string, PluginResultEvent>>({});
  const socketRef = useRef<Socket | null>(null);

  // Create socket once
  useEffect(() => {
    const socket = io(API_BASE_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("metrics", (data: MetricSnapshot) => {
      setAllServerMetrics((prev) => ({ ...prev, [data.serverId]: data }));
    });

    socket.on("alert:fired", (alert: AlertHistoryEntry) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 50));
    });

    socket.on("alert:resolved", (alert: Pick<AlertHistoryEntry, "id" | "status" | "message">) => {
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alert.id ? { ...a, status: "resolved" as const, message: alert.message } : a,
        ),
      );
    });

    socket.on("httpcheck:result", (result: HttpCheckResult) => {
      setHttpCheckResults((prev) => ({ ...prev, [result.checkId]: result }));
    });

    socket.on("tcpcheck:result", (result: TcpCheckResult) => {
      setTcpCheckResults((prev) => ({ ...prev, [result.checkId]: result }));
    });
    socket.on("pingcheck:result", (result: PingCheckResult) => {
      setPingCheckResults((prev) => ({ ...prev, [result.checkId]: result }));
    });
    socket.on("dnscheck:result", (result: DnsCheckResult) => {
      setDnsCheckResults((prev) => ({ ...prev, [result.checkId]: result }));
    });
    socket.on("heartbeat:ping", (e: HeartbeatEvent) => {
      setHeartbeatEvents((prev) => ({ ...prev, [e.monitorId]: { ...e, status: "up" } }));
    });
    socket.on("heartbeat:missed", (e: HeartbeatEvent) => {
      setHeartbeatEvents((prev) => ({ ...prev, [e.monitorId]: { ...e, status: "down" } }));
    });
    socket.on("heartbeat:recovered", (e: HeartbeatEvent) => {
      setHeartbeatEvents((prev) => ({ ...prev, [e.monitorId]: { ...e, status: "up" } }));
    });

    socket.on("pipeline:update", (pipeline: Pipeline) => {
      setPipelineUpdates((prev) => [pipeline, ...prev].slice(0, 50));
    });

    socket.on("docker:metrics", (data: { serverId: string; containers: DockerContainer[] }) => {
      setDockerMetrics((prev) => ({ ...prev, [data.serverId]: data.containers }));
    });

    socket.on("event", (record: EventRecord) => {
      setEvents((prev) => [record, ...prev].slice(0, 500));
    });
    socket.on("anomaly", (a: AnomalyEvent) => {
      const key = `${a.serverId}:${a.metric}`;
      setAnomalies((prev) => {
        const list = prev[key] ?? [];
        return { ...prev, [key]: [a, ...list].slice(0, 100) };
      });
    });
    socket.on("incident:created", (incident: Incident) => {
      setIncidents((prev) => [incident, ...prev.filter((i) => i._id !== incident._id)]);
    });
    socket.on("incident:updated", (incident: Incident) => {
      setIncidents((prev) => prev.map((i) => (i._id === incident._id ? incident : i)));
    });
    socket.on("plugin:result", (result: PluginResultEvent) => {
      setPluginResults((prev) => ({ ...prev, [result.instanceId]: result }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Filter live data for selected server
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onMetrics = (data: MetricSnapshot) => {
      if (!selectedServerId || data.serverId !== selectedServerId) return;
      setLiveData((prev) => [...prev.slice(-300), data]);
    };

    socket.on("metrics", onMetrics);
    return () => {
      socket.off("metrics", onMetrics);
    };
  }, [selectedServerId]);

  const resetStream = useCallback(() => setLiveData([]), []);
  const clearAlerts = useCallback(() => setAlerts([]), []);

  return {
    liveData,
    alerts,
    connected,
    allServerMetrics,
    httpCheckResults,
    tcpCheckResults,
    pingCheckResults,
    dnsCheckResults,
    heartbeatEvents,
    pipelineUpdates,
    dockerMetrics,
    events,
    anomalies,
    incidents,
    pluginResults,
    resetStream,
    clearAlerts,
  };
}

export default useSocket;
