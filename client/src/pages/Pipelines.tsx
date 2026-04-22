import { useEffect, useState } from "react";
import { GitBranch, Trash2, CheckCircle, XCircle, Clock, Activity, Filter } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { fetchPipelines, fetchPipelineStats, deletePipeline, fetchCurrentUser } from "../services/api";
import { toast } from "react-toastify";
import type { Pipeline, PipelineStats } from "../types";

interface PipelinesProps {
  pipelineUpdates?: Pipeline[];
}

const SOURCE_ICONS: Record<string, string> = {
  github: "GH", gitlab: "GL", jenkins: "JK", bitbucket: "BB",
};

const SOURCE_COLORS: Record<string, string> = {
  github: "bg-gray-700 text-white",
  gitlab: "bg-orange-500/20 text-orange-400",
  jenkins: "bg-red-500/20 text-red-400",
  bitbucket: "bg-blue-500/20 text-blue-400",
};

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-400/10 text-emerald-400",
  failure: "bg-red-400/10 text-red-400",
  running: "bg-blue-400/10 text-blue-400",
  cancelled: "bg-gray-700 text-gray-400",
  pending: "bg-amber-400/10 text-amber-400",
};

function StatCard({ icon: Icon, label, value, color, bg }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-4 flex items-center gap-3">
      <div className={`${bg} p-2 rounded-lg`}><Icon size={18} className={color} /></div>
      <div>
        <p className="text-[11px] text-gray-500 font-medium">{label}</p>
        <p className={`text-lg font-semibold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

function formatDuration(ms?: number): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface ExtPipeline extends Pipeline {
  pipelineName?: string;
  runNumber?: number;
  durationMs?: number;
}

function PipelineCard({ pipeline: p, onDelete }: { pipeline: ExtPipeline; onDelete: (id: string) => void }) {
  return (
    <div className={`bg-[#0d1117] rounded-xl border p-4 flex items-center gap-4 ${p.status === "failure" ? "border-red-900/50" : "border-gray-800"}`}>
      <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${SOURCE_COLORS[p.source] ?? "bg-gray-700 text-gray-300"}`}>
        {SOURCE_ICONS[p.source] ?? "CI"}
      </div>
      <div className="flex-shrink-0">
        <div className={`w-3 h-3 rounded-full ${p.status === "success" ? "bg-emerald-400" : p.status === "failure" ? "bg-red-400" : p.status === "running" ? "bg-blue-400 animate-pulse" : "bg-gray-500"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-200 text-sm truncate">{p.pipelineName ?? p.repo}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[p.status] ?? "bg-gray-700 text-gray-400"}`}>
            {p.status?.toUpperCase()}
          </span>
          {(p.runNumber ?? 0) > 0 && <span className="text-[10px] text-gray-600">#{p.runNumber}</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500 truncate">{p.repo}</span>
          {p.branch && <span className="text-xs text-gray-600">→ {p.branch}</span>}
        </div>
      </div>
      <div className="hidden md:flex items-center gap-4 text-xs text-gray-500">
        {p.durationMs != null && (
          <span className="flex items-center gap-1"><Clock size={12} />{formatDuration(p.durationMs)}</span>
        )}
        <span>{timeAgo(p.startedAt)}</span>
      </div>
      <button type="button" onClick={() => onDelete(p._id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-colors">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function Pipelines({ pipelineUpdates = [] }: PipelinesProps) {
  const [pipelines, setPipelines] = useState<ExtPipeline[]>([]);
  const [stats, setStats] = useState<(PipelineStats & { successRate?: number; failures24h?: number; avgDuration?: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    void loadData();
    fetchCurrentUser().then((u) => setApiKey((u as { apiKey?: string }).apiKey ?? "")).catch(() => {});
    const interval = setInterval(() => void loadData(), 15_000);
    return () => clearInterval(interval);
  }, [sourceFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pipelineUpdates.length === 0) return;
    const latest = pipelineUpdates[0] as ExtPipeline;
    setPipelines((prev) => {
      const idx = prev.findIndex((p) => p._id === latest._id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = latest;
        return updated;
      }
      return [latest, ...prev].slice(0, 100);
    });
  }, [pipelineUpdates]);

  async function loadData() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (sourceFilter) params.source = sourceFilter;
      if (statusFilter) params.status = statusFilter;
      const [list, s] = await Promise.all([fetchPipelines(params), fetchPipelineStats()]);
      setPipelines(list as ExtPipeline[]);
      setStats(s as PipelineStats & { successRate?: number; failures24h?: number; avgDuration?: number });
    } catch {
      toast.error("Failed to load pipelines");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePipeline(id);
      setPipelines((prev) => prev.filter((p) => p._id !== id));
      toast.success("Pipeline run deleted");
    } catch { toast.error("Failed to delete pipeline run"); }
  }

  return (
    <div>
      <PageHeader title="CI/CD Pipelines" subtitle="Monitor builds and deployments across all platforms" />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Activity} label="Total Runs" value={stats.total} color="text-emerald-400" bg="bg-emerald-400/10" />
          <StatCard icon={CheckCircle} label="Success Rate" value={`${stats.successRate ?? 0}%`} color="text-emerald-400" bg="bg-emerald-400/10" />
          <StatCard icon={Clock} label="Avg Duration" value={formatDuration(stats.avgDuration)} color="text-blue-400" bg="bg-blue-400/10" />
          <StatCard icon={XCircle} label="Failures (24h)" value={stats.failures24h ?? 0} color="text-red-400" bg="bg-red-400/10" />
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-500" />
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="form-input w-auto text-xs py-1.5">
            <option value="">All Sources</option>
            <option value="github">GitHub Actions</option>
            <option value="gitlab">GitLab CI</option>
            <option value="jenkins">Jenkins</option>
            <option value="bitbucket">Bitbucket</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-input w-auto text-xs py-1.5">
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="running">Running</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
        </div>
      ) : pipelines.length === 0 ? (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-12 text-center">
          <GitBranch size={40} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400">No pipeline runs recorded</p>
          <p className="text-xs text-gray-600 mt-1 mb-4">Configure your CI/CD platform to send webhooks to Theoria</p>
          <div className="bg-gray-900 rounded-lg p-4 text-left max-w-lg mx-auto">
            <p className="text-[10px] text-gray-500 font-semibold uppercase mb-2">Webhook URL</p>
            <code className="text-xs text-emerald-400 block mb-3">POST {window.location.origin}/api/pipelines/webhook</code>
            <p className="text-[10px] text-gray-500 font-semibold uppercase mb-2">Authorization Header</p>
            <code className="text-xs text-gray-300 block">Bearer {apiKey ? apiKey.slice(0, 8) + "..." : "<your-api-key>"}</code>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {pipelines.map((p) => (
            <PipelineCard key={p._id} pipeline={p} onDelete={(id) => void handleDelete(id)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Pipelines;
