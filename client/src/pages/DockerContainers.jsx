import { useEffect, useState } from "react";
import { Box, Cpu, HardDrive, Activity, Wifi } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { fetchDockerContainers } from "../services/api";

const STATE_STYLES = {
  running: { dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]", badge: "bg-emerald-400/10 text-emerald-400" },
  exited: { dot: "bg-red-400", badge: "bg-red-400/10 text-red-400" },
  paused: { dot: "bg-amber-400", badge: "bg-amber-400/10 text-amber-400" },
  created: { dot: "bg-gray-500", badge: "bg-gray-700 text-gray-400" },
  restarting: { dot: "bg-blue-400 animate-pulse", badge: "bg-blue-400/10 text-blue-400" },
};

function DockerContainers({ dockerMetrics = {} }) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  // Merge live metrics
  useEffect(() => {
    if (Object.keys(dockerMetrics).length === 0) return;
    const allContainers = [];
    for (const [serverId, serverContainers] of Object.entries(dockerMetrics)) {
      for (const c of serverContainers) {
        allContainers.push({ ...c, serverId });
      }
    }
    if (allContainers.length > 0) {
      setContainers(allContainers);
    }
  }, [dockerMetrics]);

  async function loadData() {
    try {
      const data = await fetchDockerContainers();
      setContainers(data);
    } catch {
      // silently fail — Docker may not be running
    } finally {
      setLoading(false);
    }
  }

  const running = containers.filter((c) => c.state === "running").length;
  const totalCpu = containers.reduce((sum, c) => sum + (c.cpuPercent || 0), 0);
  const totalMem = containers.reduce((sum, c) => sum + (c.memUsage || 0), 0);

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }

  return (
    <div>
      <PageHeader title="Docker Containers" subtitle="Monitor container health, CPU, memory, and network" />

      {/* Summary Cards */}
      {containers.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Box} label="Total Containers" value={containers.length} color="text-emerald-400" bg="bg-emerald-400/10" />
          <StatCard icon={Activity} label="Running" value={running} color="text-emerald-400" bg="bg-emerald-400/10" />
          <StatCard icon={Cpu} label="Total CPU" value={`${totalCpu.toFixed(1)}%`} color="text-blue-400" bg="bg-blue-400/10" />
          <StatCard icon={HardDrive} label="Total Memory" value={formatBytes(totalMem)} color="text-purple-400" bg="bg-purple-400/10" />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
        </div>
      ) : containers.length === 0 ? (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-12 text-center">
          <Box size={40} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400">No Docker containers detected</p>
          <p className="text-xs text-gray-600 mt-1">Start the agent with <code className="text-emerald-400">--docker</code> flag to enable Docker monitoring</p>
          <div className="bg-gray-900 rounded-lg p-3 mt-4 max-w-md mx-auto">
            <code className="text-xs text-gray-300">npx theoria-cli agent --docker --url http://server:4000 --key &lt;key&gt;</code>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {containers.map((c) => (
            <ContainerCard key={c.containerId || c._id} container={c} formatBytes={formatBytes} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-4 flex items-center gap-3">
      <div className={`${bg} p-2 rounded-lg`}>
        <Icon size={18} className={color} />
      </div>
      <div>
        <p className="text-[11px] text-gray-500 font-medium">{label}</p>
        <p className={`text-lg font-semibold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

function ContainerCard({ container: c, formatBytes }) {
  const style = STATE_STYLES[c.state] || STATE_STYLES.created;

  return (
    <div className={`bg-[#0d1117] rounded-xl border border-gray-800 p-4 ${c.state !== "running" ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
        <span className="font-medium text-gray-200 text-sm truncate flex-1">{c.name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${style.badge}`}>
          {c.state?.toUpperCase()}
        </span>
      </div>

      {/* Image */}
      <p className="text-xs text-gray-500 mb-3 truncate">{c.image}</p>

      {/* Metrics */}
      {c.state === "running" && (
        <div className="grid grid-cols-2 gap-3">
          <MiniMetric label="CPU" value={`${(c.cpuPercent || 0).toFixed(1)}%`} warn={c.cpuPercent > 80} />
          <MiniMetric label="Memory" value={`${(c.memPercent || 0).toFixed(1)}%`} warn={c.memPercent > 80} />
          <MiniMetric label="Mem Used" value={formatBytes(c.memUsage)} />
          <MiniMetric label="Mem Limit" value={formatBytes(c.memLimit)} />
          <MiniMetric label="Net RX" value={formatBytes(c.netRx)} />
          <MiniMetric label="Net TX" value={formatBytes(c.netTx)} />
        </div>
      )}

      {/* Server ID */}
      {c.serverId && (
        <p className="text-[10px] text-gray-600 mt-3 flex items-center gap-1">
          <Wifi size={10} /> {c.serverId}
        </p>
      )}
    </div>
  );
}

function MiniMetric({ label, value, warn }) {
  return (
    <div>
      <p className="text-[10px] text-gray-600 uppercase">{label}</p>
      <p className={`text-sm font-medium ${warn ? "text-amber-400" : "text-gray-300"}`}>{value}</p>
    </div>
  );
}

export default DockerContainers;
