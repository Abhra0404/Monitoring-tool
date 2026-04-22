import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import PageHeader from "../components/PageHeader";
import {
  fetchAllAlertRules, createAlertRule, deleteAlertRule,
  toggleAlertRule, fetchAlertHistory,
} from "../services/api";
import { toast } from "react-toastify";
import type { AlertRule, AlertHistoryEntry } from "../types";

const METRICS = [
  { value: "cpu_usage",                   label: "CPU Usage (%)" },
  { value: "memory_usage_percent",        label: "Memory Usage (%)" },
  { value: "disk_usage_percent",          label: "Disk Usage (%)" },
  { value: "load_avg_1m",                 label: "Load Average (1m)" },
  { value: "load_avg_5m",                 label: "Load Average (5m)" },
  { value: "network_rx_bytes_per_sec",    label: "Network RX (bytes/s)" },
  { value: "network_tx_bytes_per_sec",    label: "Network TX (bytes/s)" },
];

const OPERATORS = [">", ">=", "<", "<=", "=="];

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function RulesList({ rules, onDelete, onToggle }: {
  rules: AlertRule[];
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  if (rules.length === 0) {
    return (
      <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-12 text-center">
        <Bell size={40} className="mx-auto mb-3 text-gray-600" />
        <p className="text-gray-400">No alert rules configured</p>
        <p className="text-xs text-gray-600 mt-1">Create your first rule to start monitoring</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rules.map((rule) => {
        const metricLabel = METRICS.find((m) => m.value === rule.metricName)?.label ?? rule.metricName;
        const labels = rule.labels instanceof Object ? (rule.labels.host ?? "All servers") : "All servers";
        return (
          <div
            key={rule._id}
            className={`bg-[#0d1117] rounded-xl border border-gray-800 p-4 flex items-center gap-4 transition-opacity ${!rule.isActive ? "opacity-50" : ""}`}
          >
            <button type="button" onClick={() => onToggle(rule._id)} className="text-gray-400 hover:text-emerald-400 transition-colors">
              {rule.isActive ? <ToggleRight size={24} className="text-emerald-400" /> : <ToggleLeft size={24} />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-200 text-sm">{rule.name}</span>
                {rule.durationMinutes > 0 && (
                  <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                    for {rule.durationMinutes}m
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {metricLabel} {rule.operator} {rule.threshold} · {labels}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDelete(rule._id)}
              className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function HistoryList({ history }: { history: AlertHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-12 text-center">
        <CheckCircle size={40} className="mx-auto mb-3 text-gray-600" />
        <p className="text-gray-400">No alert history</p>
        <p className="text-xs text-gray-600 mt-1">Alerts will appear here when triggered</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {history.map((alert) => {
        const isFiring = alert.status === "firing";
        return (
          <div
            key={alert._id}
            className={`bg-[#0d1117] rounded-xl border p-4 flex items-start gap-3 ${isFiring ? "border-red-900/50" : "border-gray-800"}`}
          >
            <div className={`mt-0.5 ${isFiring ? "text-red-400" : "text-emerald-400"}`}>
              {isFiring ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${isFiring ? "text-red-400" : "text-gray-300"}`}>
                  {alert.ruleName}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{alert.message}</p>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-600">
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  Fired: {new Date(alert.firedAt).toLocaleString()}
                </span>
                {alert.resolvedAt && <span>Resolved: {new Date(alert.resolvedAt).toLocaleString()}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Alerts() {
  const [tab, setTab] = useState<"rules" | "history">("rules");
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [formName, setFormName] = useState("");
  const [formMetric, setFormMetric] = useState("cpu_usage");
  const [formOperator, setFormOperator] = useState(">");
  const [formThreshold, setFormThreshold] = useState(80);
  const [formHost, setFormHost] = useState("");
  const [formDuration, setFormDuration] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadData();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      if (tab === "rules") {
        setRules((await fetchAllAlertRules()) as AlertRule[]);
      } else {
        setHistory((await fetchAlertHistory({ limit: 100 })) as AlertHistoryEntry[]);
      }
    } catch {
      toast.error("Failed to load alert data");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRule(e: FormEvent) {
    e.preventDefault();
    if (!formName.trim()) { toast.error("Rule name is required"); return; }
    setSaving(true);
    try {
      await createAlertRule({
        name: formName.trim(),
        metricName: formMetric,
        operator: formOperator,
        threshold: Number(formThreshold),
        durationMinutes: Number(formDuration),
        labels: formHost ? { host: formHost } : {},
      } as Omit<AlertRule, "_id">);
      toast.success("Alert rule created");
      setShowForm(false);
      resetForm();
      void loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? "Failed to create rule");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ruleId: string) {
    try {
      await deleteAlertRule(ruleId);
      toast.success("Rule deleted");
      setRules((prev) => prev.filter((r) => r._id !== ruleId));
    } catch { toast.error("Failed to delete rule"); }
  }

  async function handleToggle(ruleId: string) {
    try {
      const updated = (await toggleAlertRule(ruleId)) as AlertRule;
      setRules((prev) => prev.map((r) => (r._id === ruleId ? updated : r)));
    } catch { toast.error("Failed to toggle rule"); }
  }

  function resetForm() {
    setFormName(""); setFormMetric("cpu_usage"); setFormOperator(">");
    setFormThreshold(80); setFormHost(""); setFormDuration(0);
  }

  return (
    <div>
      <PageHeader title="Alerts" subtitle="Manage alert rules and view history">
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/10 text-emerald-400 text-sm font-medium rounded-lg hover:bg-emerald-400/20 transition-colors"
        >
          <Plus size={16} />
          New Rule
        </button>
      </PageHeader>

      <div className="flex gap-1 mb-6 bg-[#0d1117] border border-gray-800 rounded-lg p-0.5 w-fit">
        {(["rules", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              tab === t ? "bg-emerald-400/10 text-emerald-400" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "rules" ? `Rules (${rules.length})` : "History"}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 mb-6">
          <h3 className="text-sm font-medium text-gray-200 mb-4">Create Alert Rule</h3>
          <form onSubmit={(e) => void handleCreateRule(e)} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <FormField label="Rule Name">
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., High CPU Alert" className="form-input" required />
            </FormField>
            <FormField label="Metric">
              <select value={formMetric} onChange={(e) => setFormMetric(e.target.value)} className="form-input">
                {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </FormField>
            <FormField label="Condition">
              <div className="flex gap-2">
                <select value={formOperator} onChange={(e) => setFormOperator(e.target.value)} className="form-input w-20">
                  {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
                <input type="number" value={formThreshold} onChange={(e) => setFormThreshold(Number(e.target.value))} className="form-input flex-1" required />
              </div>
            </FormField>
            <FormField label="Server (optional)">
              <input type="text" value={formHost} onChange={(e) => setFormHost(e.target.value)} placeholder="All servers" className="form-input" />
            </FormField>
            <FormField label="Duration (minutes)">
              <input type="number" min="0" value={formDuration} onChange={(e) => setFormDuration(Number(e.target.value))} className="form-input" />
            </FormField>
            <div className="flex items-end gap-2">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-400 text-gray-900 font-medium text-sm rounded-lg hover:bg-emerald-300 transition-colors disabled:opacity-50">
                {saving ? "Creating..." : "Create Rule"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 text-gray-400 text-sm rounded-lg hover:bg-gray-800 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
        </div>
      ) : tab === "rules" ? (
        <RulesList rules={rules} onDelete={(id) => void handleDelete(id)} onToggle={(id) => void handleToggle(id)} />
      ) : (
        <HistoryList history={history} />
      )}
    </div>
  );
}

export default Alerts;
