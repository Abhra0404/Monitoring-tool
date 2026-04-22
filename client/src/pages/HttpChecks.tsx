import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Globe, Plus, Trash2, ToggleLeft, ToggleRight, Clock,
  CheckCircle, XCircle, ShieldCheck, Activity,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import { fetchHttpChecks, createHttpCheck, deleteHttpCheck, toggleHttpCheck } from "../services/api";
import { toast } from "react-toastify";
import type { HttpCheckResult } from "../types";

interface HttpCheckRecord {
  _id: string;
  name: string;
  url: string;
  interval: number;
  expectedStatus?: number;
  isActive: boolean;
  status?: "up" | "down" | "pending";
  lastResponseTime?: number;
  lastStatusCode?: number;
  sslExpiry?: number;
  uptimePercent?: number;
  lastCheckedAt?: string;
}

interface HttpChecksProps {
  httpCheckResults?: Record<string, HttpCheckResult>;
}

const INTERVALS = [
  { value: 30000, label: "30 seconds" },
  { value: 60000, label: "1 minute" },
  { value: 120000, label: "2 minutes" },
  { value: 300000, label: "5 minutes" },
];

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color, bg }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number | string;
  color: string;
  bg: string;
}) {
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

function CheckCard({ check, onDelete, onToggle }: {
  check: HttpCheckRecord;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const isUp = check.status === "up";
  const isDown = check.status === "down";
  const isPending = check.status === "pending";
  const isHttps = check.url?.startsWith("https");

  return (
    <div className={`bg-[#0d1117] rounded-xl border p-4 flex items-center gap-4 transition-opacity ${isDown ? "border-red-900/50" : "border-gray-800"} ${!check.isActive ? "opacity-50" : ""}`}>
      <button type="button" onClick={() => onToggle(check._id)} className="text-gray-400 hover:text-emerald-400 transition-colors">
        {check.isActive ? <ToggleRight size={24} className="text-emerald-400" /> : <ToggleLeft size={24} />}
      </button>
      <div className="flex-shrink-0">
        <div className={`w-3 h-3 rounded-full ${isUp ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : isDown ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]" : "bg-gray-500"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-200 text-sm">{check.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isUp ? "bg-emerald-400/10 text-emerald-400" : isDown ? "bg-red-400/10 text-red-400" : "bg-gray-700 text-gray-400"}`}>
            {check.status?.toUpperCase() ?? "PENDING"}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{check.url}</p>
      </div>
      <div className="hidden md:flex items-center gap-4 text-xs text-gray-400">
        {check.lastResponseTime != null && (
          <div className="flex items-center gap-1" title="Response time">
            <Clock size={12} />
            <span className={check.lastResponseTime > 2000 ? "text-amber-400" : "text-gray-300"}>{check.lastResponseTime}ms</span>
          </div>
        )}
        {!isPending && check.uptimePercent != null && (
          <div className="flex items-center gap-1" title="Uptime">
            <Activity size={12} />
            <span className={check.uptimePercent < 99 ? "text-amber-400" : "text-gray-300"}>{check.uptimePercent.toFixed(1)}%</span>
          </div>
        )}
        {isHttps && check.sslExpiry != null && (
          <div className="flex items-center gap-1" title="SSL certificate expiry">
            <ShieldCheck size={12} />
            <span className={check.sslExpiry < 14 ? "text-amber-400" : "text-gray-300"}>{check.sslExpiry}d</span>
          </div>
        )}
        {check.lastStatusCode != null && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${check.lastStatusCode >= 200 && check.lastStatusCode < 300 ? "bg-emerald-400/10 text-emerald-400" : check.lastStatusCode >= 400 ? "bg-red-400/10 text-red-400" : "bg-amber-400/10 text-amber-400"}`}>
            {check.lastStatusCode}
          </span>
        )}
      </div>
      <button type="button" onClick={() => onDelete(check._id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-colors">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function HttpChecks({ httpCheckResults = {} }: HttpChecksProps) {
  const [checks, setChecks] = useState<HttpCheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formInterval, setFormInterval] = useState(60000);
  const [formExpectedStatus, setFormExpectedStatus] = useState(200);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => void loadData(), 15_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Object.keys(httpCheckResults).length === 0) return;
    setChecks((prev) =>
      prev.map((check) => {
        const live = httpCheckResults[check._id];
        if (!live) return check;
        return {
          ...check,
          status: live.status,
          lastResponseTime: live.latency,
          lastStatusCode: live.statusCode,
          lastCheckedAt: new Date(live.timestamp).toISOString(),
        };
      }),
    );
  }, [httpCheckResults]);

  async function loadData() {
    try {
      const data = await fetchHttpChecks();
      setChecks(data as HttpCheckRecord[]);
    } catch {
      toast.error("Failed to load HTTP checks");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formUrl.trim()) { toast.error("Name and URL are required"); return; }
    try { new URL(formUrl); } catch { toast.error("Invalid URL format"); return; }
    setSaving(true);
    try {
      await createHttpCheck({ name: formName.trim(), url: formUrl.trim(), interval: formInterval, expectedStatus: formExpectedStatus });
      toast.success("HTTP check created");
      setShowForm(false);
      resetForm();
      void loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? "Failed to create check");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(checkId: string) {
    try { await deleteHttpCheck(checkId); toast.success("Check deleted"); setChecks((prev) => prev.filter((c) => c._id !== checkId)); }
    catch { toast.error("Failed to delete check"); }
  }

  async function handleToggle(checkId: string) {
    try {
      const updated = (await toggleHttpCheck(checkId)) as HttpCheckRecord;
      setChecks((prev) => prev.map((c) => (c._id === checkId ? updated : c)));
    } catch { toast.error("Failed to toggle check"); }
  }

  function resetForm() { setFormName(""); setFormUrl(""); setFormInterval(60000); setFormExpectedStatus(200); }

  const totalUp = checks.filter((c) => c.status === "up").length;
  const totalDown = checks.filter((c) => c.status === "down").length;
  const avgResponseTime = checks.length > 0
    ? Math.round(checks.reduce((sum, c) => sum + (c.lastResponseTime ?? 0), 0) / checks.length)
    : 0;

  return (
    <div>
      <PageHeader title="HTTP Checks" subtitle="Monitor website uptime, response time, and SSL certificates">
        <button type="button" onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/10 text-emerald-400 text-sm font-medium rounded-lg hover:bg-emerald-400/20 transition-colors">
          <Plus size={16} /> New Check
        </button>
      </PageHeader>

      {checks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard icon={Globe} label="Total Checks" value={checks.length} color="text-emerald-400" bg="bg-emerald-400/10" />
          <SummaryCard icon={CheckCircle} label="Up" value={totalUp} color="text-emerald-400" bg="bg-emerald-400/10" />
          <SummaryCard icon={XCircle} label="Down" value={totalDown} color="text-red-400" bg="bg-red-400/10" />
          <SummaryCard icon={Activity} label="Avg Response" value={`${avgResponseTime}ms`} color="text-blue-400" bg="bg-blue-400/10" />
        </div>
      )}

      {showForm && (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 mb-6">
          <h3 className="text-sm font-medium text-gray-200 mb-4">Add HTTP Check</h3>
          <form onSubmit={(e) => void handleCreate(e)} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <FormField label="Name"><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., My Website" className="form-input" required /></FormField>
            <FormField label="URL"><input type="url" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://example.com" className="form-input" required /></FormField>
            <FormField label="Check Interval">
              <select value={formInterval} onChange={(e) => setFormInterval(Number(e.target.value))} className="form-input">
                {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </FormField>
            <FormField label="Expected Status">
              <div className="flex gap-2">
                <input type="number" value={formExpectedStatus} onChange={(e) => setFormExpectedStatus(Number(e.target.value))} className="form-input flex-1" />
                <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-400 text-gray-900 font-medium text-sm rounded-lg hover:bg-emerald-300 transition-colors disabled:opacity-50 whitespace-nowrap">
                  {saving ? "Adding..." : "Add"}
                </button>
              </div>
            </FormField>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
        </div>
      ) : checks.length === 0 ? (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-12 text-center">
          <Globe size={40} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400">No HTTP checks configured</p>
          <p className="text-xs text-gray-600 mt-1">Add your first check to start monitoring uptime</p>
        </div>
      ) : (
        <div className="space-y-2">
          {checks.map((check) => (
            <CheckCard key={check._id} check={check} onDelete={(id) => void handleDelete(id)} onToggle={(id) => void handleToggle(id)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default HttpChecks;
