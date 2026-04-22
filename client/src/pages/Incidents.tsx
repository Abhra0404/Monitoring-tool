import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, AlertTriangle, CheckCircle2, Activity, Wrench } from "lucide-react";
import PageHeader from "../components/PageHeader";
import {
  fetchIncidents, createIncident, appendIncidentUpdate, deleteIncident,
} from "../services/api";
import type { Incident, IncidentSeverity, IncidentStatus } from "../types";

interface IncidentsProps {
  liveIncidents: Incident[];
}

const STATUS_BADGE: Record<IncidentStatus, { label: string; className: string }> = {
  investigating: { label: "Investigating", className: "bg-red-500/10 text-red-300 border-red-500/30" },
  identified:    { label: "Identified",    className: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  monitoring:    { label: "Monitoring",    className: "bg-blue-500/10 text-blue-300 border-blue-500/30" },
  resolved:      { label: "Resolved",      className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
};

const SEVERITY_BADGE: Record<IncidentSeverity, { label: string; className: string }> = {
  minor:       { label: "Minor",       className: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30" },
  major:       { label: "Major",       className: "bg-orange-500/10 text-orange-300 border-orange-500/30" },
  critical:    { label: "Critical",    className: "bg-red-500/10 text-red-300 border-red-500/30" },
  maintenance: { label: "Maintenance", className: "bg-gray-500/10 text-gray-300 border-gray-500/30" },
};

const ALLOWED_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  investigating: ["investigating", "identified", "monitoring", "resolved"],
  identified:    ["investigating", "identified", "monitoring", "resolved"],
  monitoring:    ["identified", "monitoring", "resolved"],
  resolved:      ["investigating", "resolved"],
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function Incidents({ liveIncidents }: IncidentsProps) {
  const [list, setList] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchIncidents();
      setList(items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Merge live updates in by id.
  const merged = useMemo<Incident[]>(() => {
    const map = new Map<string, Incident>();
    for (const i of list) map.set(i._id, i);
    for (const i of liveIncidents) map.set(i._id, i);
    return Array.from(map.values()).sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [list, liveIncidents]);

  const [activeIncidents, resolvedIncidents] = useMemo(() => {
    const active: Incident[] = [];
    const done: Incident[] = [];
    for (const i of merged) (i.status === "resolved" ? done : active).push(i);
    return [active, done];
  }, [merged]);

  async function handleCreate(payload: {
    title: string; message: string; severity: IncidentSeverity; services: string[];
  }) {
    const created = await createIncident(payload);
    setList((prev) => [created, ...prev.filter((i) => i._id !== created._id)]);
    setCreateOpen(false);
  }

  async function handleTransition(incident: Incident, status: IncidentStatus, message: string) {
    setBusyId(incident._id);
    try {
      const updated = await appendIncidentUpdate(incident._id, { status, message });
      setList((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(incidentId: string) {
    if (!confirm("Delete this incident and all of its updates?")) return;
    await deleteIncident(incidentId);
    setList((prev) => prev.filter((i) => i._id !== incidentId));
  }

  return (
    <div>
      <PageHeader title="Incidents" subtitle="Operational incident log with status-page publishing">
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-gray-300 hover:text-white bg-gray-800/60 hover:bg-gray-700"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
        >
          <Plus size={14} />
          New incident
        </button>
      </PageHeader>

      {createOpen && <CreateIncidentDialog onCancel={() => setCreateOpen(false)} onCreate={handleCreate} />}

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Activity size={14} /> Active ({activeIncidents.length})
        </h2>
        {activeIncidents.length === 0 ? (
          <p className="text-sm text-gray-500 border border-gray-800 rounded-lg p-4">
            No active incidents — all systems nominal.
          </p>
        ) : (
          <div className="space-y-3">
            {activeIncidents.map((i) => (
              <IncidentCard
                key={i._id}
                incident={i}
                busy={busyId === i._id}
                expanded={Boolean(expanded[i._id])}
                onToggle={() => setExpanded((prev) => ({ ...prev, [i._id]: !prev[i._id] }))}
                onTransition={handleTransition}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
          <CheckCircle2 size={14} /> Resolved ({resolvedIncidents.length})
        </h2>
        {resolvedIncidents.length === 0 ? (
          <p className="text-sm text-gray-500 border border-gray-800 rounded-lg p-4">No resolved incidents yet.</p>
        ) : (
          <div className="space-y-3">
            {resolvedIncidents.map((i) => (
              <IncidentCard
                key={i._id}
                incident={i}
                busy={busyId === i._id}
                expanded={Boolean(expanded[i._id])}
                onToggle={() => setExpanded((prev) => ({ ...prev, [i._id]: !prev[i._id] }))}
                onTransition={handleTransition}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface IncidentCardProps {
  incident: Incident;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onTransition: (incident: Incident, status: IncidentStatus, message: string) => void | Promise<void>;
  onDelete: (incidentId: string) => void | Promise<void>;
}

function IncidentCard({ incident, busy, expanded, onToggle, onTransition, onDelete }: IncidentCardProps) {
  const [nextStatus, setNextStatus] = useState<IncidentStatus>(incident.status);
  const [message, setMessage] = useState("");
  const sev = SEVERITY_BADGE[incident.severity];
  const st = STATUS_BADGE[incident.status];
  const allowed = ALLOWED_TRANSITIONS[incident.status];

  async function submitUpdate() {
    if (!message.trim()) return;
    await onTransition(incident, nextStatus, message.trim());
    setMessage("");
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0d1117] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-800/20"
      >
        <div className="mt-0.5 text-amber-400">
          {incident.severity === "maintenance" ? <Wrench size={18} /> : <AlertTriangle size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-100">{incident.title}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${st.className}`}>
              {st.label}
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${sev.className}`}>
              {sev.label}
            </span>
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            Created {formatTime(incident.createdAt)} · Updated {formatTime(incident.updatedAt)}
            {incident.services.length ? ` · ${incident.services.join(", ")}` : ""}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-800/70">
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-2">Update history</h4>
            <ol className="space-y-2 border-l-2 border-gray-700 ml-1">
              {incident.updates.map((u) => (
                <li key={u._id} className="relative pl-4">
                  <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-emerald-400" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${STATUS_BADGE[u.status].className}`}>
                      {STATUS_BADGE[u.status].label}
                    </span>
                    <span className="text-[11px] text-gray-500">{formatTime(u.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-200 mt-1">{u.message}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="border-t border-gray-800 pt-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Post an update</h4>
            <div className="space-y-2">
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as IncidentStatus)}
                className="w-full sm:w-56 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              >
                {(Object.keys(STATUS_BADGE) as IncidentStatus[]).map((s) => (
                  <option key={s} value={s} disabled={!allowed.includes(s)}>
                    {STATUS_BADGE[s].label}{!allowed.includes(s) ? " (not allowed)" : ""}
                  </option>
                ))}
              </select>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What changed? Customers will see this on the status page."
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !message.trim()}
                  onClick={() => void submitUpdate()}
                  className="text-sm px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  Publish update
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(incident._id)}
                  className="text-sm px-3 py-1.5 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 ml-auto"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CreateIncidentDialogProps {
  onCancel: () => void;
  onCreate: (payload: { title: string; message: string; severity: IncidentSeverity; services: string[] }) => Promise<void>;
}

function CreateIncidentDialog({ onCancel, onCreate }: CreateIncidentDialogProps) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<IncidentSeverity>("major");
  const [services, setServices] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!title.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        message: message.trim(),
        severity,
        services: services.split(",").map((s) => s.trim()).filter(Boolean),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1117] border border-gray-800 rounded-xl w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold text-gray-100">Declare incident</h3>
        <p className="text-xs text-gray-500 mt-1">
          Starts in <strong>investigating</strong>. Appears on the public status page if enabled.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              placeholder="e.g. Elevated API latency"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Initial update (what are you investigating?)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              placeholder="We are investigating increased error rates on the login endpoint."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              >
                <option value="minor">Minor</option>
                <option value="major">Major</option>
                <option value="critical">Critical</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Services (comma separated)</label>
              <input
                type="text"
                value={services}
                onChange={(e) => setServices(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
                placeholder="api, dashboard"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-3 py-1.5 rounded-lg text-gray-400 hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !title.trim() || !message.trim()}
            onClick={() => void submit()}
            className="text-sm px-4 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Declare incident"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Incidents;
