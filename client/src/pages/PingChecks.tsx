import { useEffect, useState, type FormEvent } from "react";
import { Radio, Plus, Trash2, ToggleLeft, ToggleRight, Clock, Activity, Percent } from "lucide-react";
import { toast } from "react-toastify";
import PageHeader from "../components/PageHeader";
import { fetchPingChecks, createPingCheck, deletePingCheck, togglePingCheck } from "../services/api";
import type { PingCheck, PingCheckResult } from "../types";

interface Props { pingCheckResults?: Record<string, PingCheckResult> }

const INTERVALS = [
  { value: 30_000, label: "30 seconds" },
  { value: 60_000, label: "1 minute" },
  { value: 300_000, label: "5 minutes" },
];

function PingChecks({ pingCheckResults = {} }: Props) {
  const [checks, setChecks] = useState<PingCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [interval, setInterval] = useState(60_000);
  const [saving, setSaving] = useState(false);

  async function load() {
    try { setChecks(await fetchPingChecks()); }
    catch { toast.error("Failed to load ping checks"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); const h = window.setInterval(() => void load(), 15_000); return () => window.clearInterval(h); }, []);

  useEffect(() => {
    if (!Object.keys(pingCheckResults).length) return;
    setChecks((prev) => prev.map((c) => {
      const live = pingCheckResults[c._id];
      if (!live) return c;
      return { ...c, status: live.status, lastLatencyMs: live.latencyMs, lastPacketLoss: live.packetLoss, uptimePercent: live.uptimePercent, lastError: live.error };
    }));
  }, [pingCheckResults]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !host.trim()) { toast.error("Name and host are required"); return; }
    if (!/^[a-zA-Z0-9._-]+$/.test(host.trim())) { toast.error("Host must be a hostname or IP"); return; }
    setSaving(true);
    try {
      await createPingCheck({ name: name.trim(), host: host.trim(), interval });
      toast.success("Ping check created");
      setShowForm(false); setName(""); setHost(""); setInterval(60_000);
      void load();
    } catch (err) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Failed to create check");
    } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Ping Checks" subtitle="ICMP reachability and packet-loss monitoring">
        <button type="button" onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/10 text-emerald-400 text-sm font-medium rounded-lg hover:bg-emerald-400/20">
          <Plus size={16} /> New Check
        </button>
      </PageHeader>

      {showForm && (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 mb-6">
          <h3 className="text-sm font-medium text-gray-200 mb-4">Add Ping Check</h3>
          <form onSubmit={(e) => void handleCreate(e)} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <label className="text-xs font-medium text-gray-500">Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Edge router" className="form-input mt-1.5" required />
            </label>
            <label className="text-xs font-medium text-gray-500">Host
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="10.0.0.1 or example.com" className="form-input mt-1.5" required />
            </label>
            <label className="text-xs font-medium text-gray-500">Interval
              <select value={interval} onChange={(e) => setInterval(Number(e.target.value))} className="form-input mt-1.5">
                {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </label>
            <button type="submit" disabled={saving} className="self-end px-4 py-2 bg-emerald-400 text-gray-900 font-medium text-sm rounded-lg hover:bg-emerald-300 disabled:opacity-50">
              {saving ? "Adding…" : "Add"}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" /></div>
      ) : checks.length === 0 ? (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-12 text-center">
          <Radio size={40} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400">No ping checks configured</p>
          <p className="text-xs text-gray-600 mt-1">Note: ICMP may be blocked in some container environments.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {checks.map((c) => {
            const isUp = c.status === "up", isDown = c.status === "down";
            const highLoss = (c.lastPacketLoss ?? 0) > 10;
            return (
              <div key={c._id} className={`bg-[#0d1117] rounded-xl border p-4 flex items-center gap-4 transition-opacity ${isDown ? "border-red-900/50" : "border-gray-800"} ${!c.isActive ? "opacity-50" : ""}`}>
                <button type="button" onClick={() => void togglePingCheck(c._id).then((u) => setChecks((p) => p.map((x) => x._id === c._id ? u : x))).catch(() => toast.error("Toggle failed"))} className="text-gray-400 hover:text-emerald-400">
                  {c.isActive ? <ToggleRight size={24} className="text-emerald-400" /> : <ToggleLeft size={24} />}
                </button>
                <div className={`w-3 h-3 rounded-full ${isUp ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : isDown ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]" : "bg-gray-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-200 text-sm">{c.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isUp ? "bg-emerald-400/10 text-emerald-400" : isDown ? "bg-red-400/10 text-red-400" : "bg-gray-700 text-gray-400"}`}>
                      {c.status?.toUpperCase() ?? "PENDING"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate font-mono">{c.host}</p>
                </div>
                <div className="hidden md:flex items-center gap-4 text-xs text-gray-400">
                  {c.lastLatencyMs != null && <div className="flex items-center gap-1"><Clock size={12} /><span>{c.lastLatencyMs.toFixed(1)}ms</span></div>}
                  {c.lastPacketLoss != null && <div className="flex items-center gap-1"><Percent size={12} /><span className={highLoss ? "text-amber-400" : "text-gray-300"}>{c.lastPacketLoss}%</span></div>}
                  {c.uptimePercent != null && <div className="flex items-center gap-1"><Activity size={12} /><span>{c.uptimePercent.toFixed(1)}%</span></div>}
                </div>
                <button type="button" onClick={() => void deletePingCheck(c._id).then(() => setChecks((p) => p.filter((x) => x._id !== c._id))).catch(() => toast.error("Delete failed"))} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/5 rounded-lg"><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PingChecks;
