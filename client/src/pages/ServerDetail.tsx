import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ReferenceDot,
} from "recharts";
import { Cpu, MemoryStick, HardDrive, Activity, Network, ArrowLeft, RefreshCw } from "lucide-react";
import MetricCard from "../components/MetricCard";
import ChartCard from "../components/ChartCard";
import TimeRangeSelector from "../components/TimeRangeSelector";
import ConnectionStatus from "../components/ConnectionStatus";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { fetchServerMetrics, fetchServer } from "../services/api";
import type { MetricSnapshot, ServerRecord, TimeRange, AnomalyEvent } from "../types";

interface ServerDetailProps {
  liveData: MetricSnapshot[];
  connected: boolean;
  resetStream: () => void;
  anomalies?: Record<string, AnomalyEvent[]>;
}

interface ChartPoint {
  time: string;
  timestamp: number;
  cpu: number;
  memory: number;
  disk: number;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
  networkRx: number;
  networkTx: number;
}

function formatChartTime(ts: number, range: TimeRange): string {
  const d = new Date(ts);
  if (["5m", "15m", "1h"].includes(range)) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  if (range === "6h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

function formatUptime(sec: number): string {
  if (!sec) return "--";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes.toFixed(0)} B`;
  if (abs < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (abs < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatBytesAxis(value: number): string {
  if (value < 1024) return `${value}B`;
  if (value < 1048576) return `${(value / 1024).toFixed(0)}K`;
  return `${(value / 1048576).toFixed(0)}M`;
}

const tooltipStyle = {
  contentStyle: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: "8px",
    fontSize: "12px",
  },
  labelStyle: { color: "#8b949e" },
};

function ServerDetail({ liveData, connected, resetStream, anomalies = {} }: ServerDetailProps) {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const [server, setServer] = useState<ServerRecord | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("5m");
  const [historicalData, setHistoricalData] = useState<MetricSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!serverId) return;
    let m = true;
    setLoading(true);
    fetchServer(serverId)
      .then((s) => { if (m) setServer(s as ServerRecord); })
      .catch(() => {})
      .finally(() => { if (m) setLoading(false); });
    return () => { m = false; };
  }, [serverId]);

  useEffect(() => {
    if (!serverId) return;
    let m = true;
    setHistoryLoading(true);
    fetchServerMetrics(serverId, timeRange)
      .then((data) => { if (m) setHistoricalData(data as MetricSnapshot[]); })
      .catch(() => { if (m) setHistoricalData([]); })
      .finally(() => { if (m) setHistoryLoading(false); });
    return () => { m = false; };
  }, [serverId, timeRange]);

  useEffect(() => {
    resetStream();
  }, [serverId, resetStream]);

  const data = useMemo<MetricSnapshot[]>(() => {
    const merged = [...historicalData, ...liveData];
    const byTs = new Map<number, MetricSnapshot>();
    for (const item of merged) {
      const ts = item.timestamp || Date.now();
      byTs.set(ts, { ...item, timestamp: ts });
    }
    return Array.from(byTs.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-400);
  }, [historicalData, liveData]);

  const chartData = useMemo<ChartPoint[]>(() => {
    return data.map((d) => {
      const memPct =
        d.memoryPercent ??
        (d.totalMem ? ((d.totalMem - (d.freeMem ?? 0)) / d.totalMem) * 100 : 0);
      const diskPct =
        d.diskPercent ??
        (d.diskTotal ? ((d.diskTotal - (d.diskFree ?? 0)) / d.diskTotal) * 100 : 0);
      return {
        time: formatChartTime(d.timestamp, timeRange),
        timestamp: d.timestamp,
        cpu: +(d.cpu || 0).toFixed(1),
        memory: +memPct.toFixed(1),
        disk: +diskPct.toFixed(1),
        loadAvg1: +(d.loadAvg1 || 0).toFixed(2),
        loadAvg5: +(d.loadAvg5 || 0).toFixed(2),
        loadAvg15: +(d.loadAvg15 || 0).toFixed(2),
        networkRx: +(d.networkRx || 0).toFixed(0),
        networkTx: +(d.networkTx || 0).toFixed(0),
      };
    });
  }, [data, timeRange]);

  const latest: Partial<MetricSnapshot> = data[data.length - 1] ?? {};
  const cpuPct = +(latest.cpu || 0).toFixed(1);
  const memPct = +(
    latest.memoryPercent ??
    (latest.totalMem ? ((latest.totalMem - (latest.freeMem ?? 0)) / latest.totalMem) * 100 : 0)
  ).toFixed(1);
  const diskPct = +(latest.diskPercent ?? 0).toFixed(1);
  const uptimeSec = latest.uptime || 0;

  // Clamp anomaly dots to the visible chart window. Each dot is plotted on
  // the chart point with the closest timestamp so Recharts can draw it in
  // sync with the line series.
  const anomalyDotsFor = useMemo(() => {
    return (metric: string) => {
      if (!serverId) return [] as Array<{ time: string; value: number; zScore: number }>;
      const key = `${serverId}:${metric}`;
      const list = anomalies[key] ?? [];
      if (chartData.length === 0 || list.length === 0) return [];
      const minTs = chartData[0].timestamp;
      const maxTs = chartData[chartData.length - 1].timestamp;
      const out: Array<{ time: string; value: number; zScore: number }> = [];
      for (const a of list) {
        if (a.timestamp < minTs || a.timestamp > maxTs) continue;
        let closest = chartData[0];
        let minDelta = Math.abs(closest.timestamp - a.timestamp);
        for (const p of chartData) {
          const d = Math.abs(p.timestamp - a.timestamp);
          if (d < minDelta) { minDelta = d; closest = p; }
        }
        out.push({ time: closest.time, value: a.value, zScore: a.zScore });
      }
      return out;
    };
  }, [anomalies, chartData, serverId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={server?.name ?? serverId ?? "Server"}
        subtitle={
          server
            ? `${server.platform ?? ""} · ${server.arch ?? ""} · ${server.cpuCount ?? "?"} cores`
            : ""
        }
      >
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <StatusBadge status={server?.status ?? "offline"} />
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        <ConnectionStatus connected={connected} />
        <button
          type="button"
          onClick={() => { resetStream(); setHistoricalData([]); }}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
        <MetricCard title="CPU" value={`${cpuPct}%`} icon={<Cpu size={18} />} color="emerald" />
        <MetricCard title="Memory" value={`${memPct}%`} icon={<MemoryStick size={18} />} color="blue" />
        <MetricCard title="Disk" value={`${diskPct}%`} icon={<HardDrive size={18} />} color="purple" />
        <MetricCard title="Uptime" value={formatUptime(uptimeSec)} icon={<Activity size={18} />} color="cyan" />
        <MetricCard
          title="Load (1m)"
          value={(latest.loadAvg1 || 0).toFixed(2)}
          subtitle={`5m: ${(latest.loadAvg5 || 0).toFixed(2)} · 15m: ${(latest.loadAvg15 || 0).toFixed(2)}`}
          icon={<Activity size={18} />}
          color="amber"
        />
        <MetricCard
          title="Network"
          value={`↓${formatBytes(latest.networkRx || 0)}/s`}
          subtitle={`↑ ${formatBytes(latest.networkTx || 0)}/s`}
          icon={<Network size={18} />}
          color="cyan"
        />
      </div>

      {historyLoading && (
        <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
          <div className="animate-spin rounded-full h-3 w-3 border border-emerald-400 border-t-transparent" />
          Loading historical data...
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        <ChartCard title="CPU Usage" subtitle="Percentage over time">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="%" />
            <Tooltip {...tooltipStyle} />
            <Area type="monotone" dataKey="cpu" stroke="#34d399" fill="url(#cpuGrad)" strokeWidth={2} dot={false} name="CPU %" />
            {anomalyDotsFor("cpu_usage").map((d, i) => (
              <ReferenceDot key={`cpu-anom-${i}`} x={d.time} y={d.value} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} />
            ))}
          </AreaChart>
        </ChartCard>

        <ChartCard title="Memory Usage" subtitle="Percentage over time">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="%" />
            <Tooltip {...tooltipStyle} />
            <Area type="monotone" dataKey="memory" stroke="#60a5fa" fill="url(#memGrad)" strokeWidth={2} dot={false} name="Memory %" />
            {anomalyDotsFor("memory_usage_percent").map((d, i) => (
              <ReferenceDot key={`mem-anom-${i}`} x={d.time} y={d.value} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} />
            ))}
          </AreaChart>
        </ChartCard>

        <ChartCard title="Disk Usage" subtitle="Percentage over time">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="%" />
            <Tooltip {...tooltipStyle} />
            <Area type="monotone" dataKey="disk" stroke="#a78bfa" fill="url(#diskGrad)" strokeWidth={2} dot={false} name="Disk %" />
            {anomalyDotsFor("disk_usage_percent").map((d, i) => (
              <ReferenceDot key={`disk-anom-${i}`} x={d.time} y={d.value} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} />
            ))}
          </AreaChart>
        </ChartCard>

        <ChartCard title="System Load" subtitle="1, 5, and 15 minute averages">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Line type="monotone" dataKey="loadAvg1" stroke="#f59e0b" strokeWidth={2} dot={false} name="1 min" />
            <Line type="monotone" dataKey="loadAvg5" stroke="#fb923c" strokeWidth={1.5} dot={false} name="5 min" strokeDasharray="4 2" />
            <Line type="monotone" dataKey="loadAvg15" stroke="#f87171" strokeWidth={1.5} dot={false} name="15 min" strokeDasharray="6 3" />
            {anomalyDotsFor("load_avg_1m").map((d, i) => (
              <ReferenceDot key={`load-anom-${i}`} x={d.time} y={d.value} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} />
            ))}
          </LineChart>
        </ChartCard>

        <ChartCard title="Network I/O" subtitle="Bytes per second" className="xl:col-span-2">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f472b6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f472b6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={formatBytesAxis} />
            <Tooltip {...tooltipStyle} formatter={(v: unknown) => formatBytes(Number(v)) + "/s"} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Area type="monotone" dataKey="networkRx" stroke="#22d3ee" fill="url(#rxGrad)" strokeWidth={2} dot={false} name="Received" />
            <Area type="monotone" dataKey="networkTx" stroke="#f472b6" fill="url(#txGrad)" strokeWidth={2} dot={false} name="Transmitted" />
          </AreaChart>
        </ChartCard>
      </div>
    </div>
  );
}

export default ServerDetail;
