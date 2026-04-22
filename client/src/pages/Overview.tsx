import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Server, Cpu, MemoryStick, HardDrive, Clock, AlertTriangle } from "lucide-react";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import GaugeChart from "../components/GaugeChart";
import ConnectionStatus from "../components/ConnectionStatus";
import { fetchServers, fetchActiveAlertCount } from "../services/api";
import type { ServerRecord, MetricSnapshot } from "../types";

interface OverviewProps {
  allServerMetrics: Record<string, MetricSnapshot>;
  connected: boolean;
}

interface SummaryCardProps {
  label: string;
  value: number;
  color: string;
  icon: ReactNode;
}

function SummaryCard({ label, value, color, icon }: SummaryCardProps) {
  return (
    <div className="bg-[#0d1117] rounded-xl border border-gray-800 px-4 py-3 flex items-center gap-3">
      <div className="text-gray-500">{icon}</div>
      <div>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        <p className="text-[11px] text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function formatUptime(seconds: number | undefined): string {
  if (!seconds) return "--";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Overview({ allServerMetrics, connected }: OverviewProps) {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [serverList, count] = await Promise.all([fetchServers(), fetchActiveAlertCount()]);
        if (!mounted) return;
        setServers(serverList);
        setAlertCount(count);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    const interval = setInterval(() => void load(), 15_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const getLatestMetrics = (serverId: string): Partial<MetricSnapshot> =>
    allServerMetrics[serverId] ?? {};

  const onlineCount = servers.filter((s) => s.status === "online").length;
  const warningCount = servers.filter((s) => s.status === "warning").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-400 border-t-transparent mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading servers...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Server Overview" subtitle={`${servers.length} servers monitored`}>
        <ConnectionStatus connected={connected} />
      </PageHeader>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Total" value={servers.length} color="text-gray-200" icon={<Server size={18} />} />
        <SummaryCard label="Online" value={onlineCount} color="text-emerald-400" icon={<div className="w-2 h-2 rounded-full bg-emerald-400" />} />
        <SummaryCard label="Warning" value={warningCount} color="text-amber-400" icon={<div className="w-2 h-2 rounded-full bg-amber-400" />} />
        <SummaryCard label="Firing Alerts" value={alertCount} color="text-red-400" icon={<AlertTriangle size={18} />} />
      </div>

      {servers.length === 0 ? (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-12 text-center">
          <Server size={48} className="mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-medium mb-2">No Servers Connected</h3>
          <p className="text-gray-500 text-sm mb-4">
            Install and run the Theoria agent on your servers to start monitoring.
          </p>
          <div className="bg-gray-900 rounded-lg p-4 max-w-md mx-auto text-left">
            <p className="text-xs text-gray-500 mb-2">Quick start:</p>
            <code className="text-xs text-emerald-400 block">API_KEY=your-key npm start --prefix agent</code>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {servers.map((server) => {
            const live = getLatestMetrics(server.serverId);
            const cpuPct = live.cpu ?? 0;
            const memPct =
              live.memoryPercent ??
              (live.totalMem ? ((live.totalMem - (live.freeMem ?? 0)) / live.totalMem) * 100 : 0);
            const diskPct = live.diskPercent ?? 0;

            return (
              <button
                key={server.serverId}
                type="button"
                onClick={() => navigate(`/servers/${server.serverId}`)}
                className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 text-left hover:border-gray-700 transition-all group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <Server size={16} className="text-gray-500 shrink-0" />
                    <span className="font-medium text-gray-200 truncate">
                      {server.name ?? server.serverId}
                    </span>
                  </div>
                  <StatusBadge status={server.status} />
                </div>

                <div className="flex items-center justify-around mb-4">
                  <div className="text-center">
                    <GaugeChart value={cpuPct} size={64} strokeWidth={5} />
                    <p className="text-[10px] text-gray-500 mt-1">CPU</p>
                  </div>
                  <div className="text-center">
                    <GaugeChart value={memPct} size={64} strokeWidth={5} color="#60a5fa" />
                    <p className="text-[10px] text-gray-500 mt-1">Memory</p>
                  </div>
                  <div className="text-center">
                    <GaugeChart value={diskPct} size={64} strokeWidth={5} color="#a78bfa" />
                    <p className="text-[10px] text-gray-500 mt-1">Disk</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-gray-500 pt-3 border-t border-gray-800/50">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {formatUptime(live.uptime)}
                  </span>
                  {server.platform && <span>{server.platform}/{server.arch}</span>}
                  <span className="text-emerald-400/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    View →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Overview;
