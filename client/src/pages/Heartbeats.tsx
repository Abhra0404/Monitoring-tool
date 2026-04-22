import { useEffect, useState, type FormEvent } from "react";
import { Heart, Plus, Trash2, ToggleLeft, ToggleRight, Clock, Copy } from "lucide-react";
import { toast } from "react-toastify";
import PageHeader from "../components/PageHeader";
import { fetchHeartbeats, createHeartbeat, deleteHeartbeat, toggleHeartbeat, API_BASE_URL } from "../services/api";
import type { HeartbeatMonitor, HeartbeatEvent } from "../types";

interface Props { heartbeatEvents?: Record<string, HeartbeatEvent & { status: "up" | "down" }> }

function Heartbeats({ heartbeatEvents = {} }: Props) {
  const [monitors, setMonitors] = useState<HeartbeatMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [expectedEverySeconds, setExpectedEverySeconds] = useState(3600);
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState(300);
  const [saving, setSaving] = useState(false);

  async function load() {
    try { setMonitors(await fetchHeartbeats()); }
    catch { toast.error("Failed to load heartbeat monitors"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); const h = window.setInterval(() => void load(), 15_000); return () => window.clearInterval(h); }, []);

  useEffect(() => {
    if (!Object.keys(heartbeatEvents).length) return;
    setMonitors((prev) => prev.map((m) => {
      const live = heartbeatEvents[m._id];
      if (!live) return m;
      return { ...m, status: live.status, lastPingAt: live.status === "up" ? new Date(live.timestamp).toISOString() : m.lastPingAt };
    }));
  }, [heartbeatEvents]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) { toast.error("Name and slug are required"); return; }
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug.trim())) { toast.error("Slug must be lowercase alphanumeric (with hyphens), 2–63 chars"); return; }
    setSaving(true);
    try {
      await createHeartbeat({ name: name.trim(), slug: slug.trim(), expectedEverySeconds, gracePeriodSeconds });
      toast.success("Heartbeat monitor created");
      setShowForm(false); setName(""); setSlug(""); setExpectedEverySeconds(3600); setGracePeriodSeconds(300);
      void load();
    } catch (err) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Failed to create monitor");
    } finally { setSaving(false); }
  }

  function pingUrl(slug: string): string {
    const base = API_BASE_URL || window.location.origin;
    return `${base.replace(/\/$/, "")}/api/heartbeats/ping/${slug}`;
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success("Copied to clipboard"); }
    catch { toast.error("Clipboard not available"); }
  }

  function formatAgo(iso?: string | null): string {
    if (!iso) return "never";
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86_400)}d ago`;
  }

  return (
    <div>
      <PageHeader title="Heartbeat Monitors" subtitle="Detect missing cron jobs and scheduled tasks">
        <button type="button" onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/10 text-emerald-400 text-sm font-medium rounded-lg hover:bg-emerald-400/20">
          <Plus size={16} /> New Monitor
        </button>
      </PageHeader>

      {showForm && (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 mb-6">
          <h3 className="text-sm font-medium text-gray-200 mb-4">Add Heartbeat Monitor</h3>
          <form onSubmit={(e) => void handleCreate(e)} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <label className="text-xs font-medium text-gray-500">Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nightly backups" className="form-input mt-1.5" required />
            </label>
            <label className="text-xs font-medium text-gray-500">Slug (URL)
              <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="nightly-backups" className="form-input mt-1.5 font-mono" required />
            </label>
            <label className="text-xs font-medium text-gray-500">Expected every (sec)
              <input type="number" min={10} value={expectedEverySeconds} onChange={(e) => setExpectedEverySeconds(Number(e.target.value))} className="form-input mt-1.5" required />
            </label>
            <label className="text-xs font-medium text-gray-500">Grace period (sec)
              <div className="flex gap-2 mt-1.5">
                <input type="number" min={0} value={gracePeriodSeconds} onChange={(e) => setGracePeriodSeconds(Number(e.target.value))} className="form-input flex-1" required />
                <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-400 text-gray-900 font-medium text-sm rounded-lg hover:bg-emerald-300 disabled:opacity-50 whitespace-nowrap">
                  {saving ? "Adding…" : "Add"}
                </button>
              </div>
            </label>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" /></div>
      ) : monitors.length === 0 ? (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-12 text-center">
          <Heart size={40} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400">No heartbeat monitors configured</p>
          <p className="text-xs text-gray-600 mt-1">Add one, then POST to the generated URL from your cron/script.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {monitors.map((m) => {
            const url = pingUrl(m.slug);
            const isUp = m.status === "up", isDown = m.status === "down";
            return (
              <div key={m._id} className={`bg-[#0d1117] rounded-xl border p-4 flex flex-col md:flex-row md:items-center gap-4 ${isDown ? "border-red-900/50" : "border-gray-800"} ${!m.isActive ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => void toggleHeartbeat(m._id).then((u) => setMonitors((p) => p.map((x) => x._id === m._id ? u : x))).catch(() => toast.error("Toggle failed"))} className="text-gray-400 hover:text-emerald-400">
                    {m.isActive ? <ToggleRight size={24} className="text-emerald-400" /> : <ToggleLeft size={24} />}
                  </button>
                  <div className={`w-3 h-3 rounded-full ${isUp ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : isDown ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]" : "bg-gray-500"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-200 text-sm">{m.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isUp ? "bg-emerald-400/10 text-emerald-400" : isDown ? "bg-red-400/10 text-red-400" : "bg-gray-700 text-gray-400"}`}>
                      {m.status?.toUpperCase() ?? "PENDING"}
                    </span>
                  </div>
                  <button type="button" onClick={() => void copy(url)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-400 mt-1 font-mono truncate">
                    <Copy size={11} /> {url}
                  </button>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <div className="flex items-center gap-1" title="Expected every"><Clock size={12} /><span>{m.expectedEverySeconds}s</span></div>
                  <div title="Last ping">{formatAgo(m.lastPingAt)}</div>
                </div>
                <button type="button" onClick={() => void deleteHeartbeat(m._id).then(() => setMonitors((p) => p.filter((x) => x._id !== m._id))).catch(() => toast.error("Delete failed"))} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/5 rounded-lg self-start md:self-auto"><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Heartbeats;
