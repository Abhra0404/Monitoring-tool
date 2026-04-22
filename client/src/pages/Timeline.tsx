import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, AlertTriangle, Bell, CheckCircle2,
  Circle, GitBranch, Globe, Heart, Info, RefreshCw, Server, XCircle,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import { fetchEvents } from "../services/api";
import type { EventKind, EventRecord, EventSeverity } from "../types";

interface TimelineProps {
  liveEvents: EventRecord[];
}

const KIND_LABELS: Record<EventKind, string> = {
  metric: "Metric",
  alert_fired: "Alert fired",
  alert_resolved: "Alert resolved",
  http_check: "HTTP check",
  tcp_check: "TCP check",
  ping_check: "Ping check",
  dns_check: "DNS check",
  heartbeat_ping: "Heartbeat",
  heartbeat_missed: "Heartbeat missed",
  heartbeat_recovered: "Heartbeat recovered",
  pipeline: "Pipeline",
  server_online: "Server online",
  server_offline: "Server offline",
  anomaly: "Anomaly",
  incident_created: "Incident opened",
  incident_updated: "Incident updated",
  incident_resolved: "Incident resolved",
};

const FILTER_GROUPS: Array<{ label: string; kinds: EventKind[] }> = [
  { label: "Alerts", kinds: ["alert_fired", "alert_resolved"] },
  { label: "Anomalies", kinds: ["anomaly"] },
  { label: "Checks", kinds: ["http_check", "tcp_check", "ping_check", "dns_check"] },
  { label: "Heartbeats", kinds: ["heartbeat_missed", "heartbeat_recovered"] },
  { label: "Pipelines", kinds: ["pipeline"] },
  { label: "Servers", kinds: ["server_online", "server_offline"] },
  { label: "Incidents", kinds: ["incident_created", "incident_updated", "incident_resolved"] },
];

function iconFor(kind: EventKind, sev: EventSeverity) {
  const size = 16;
  switch (kind) {
    case "alert_fired": return <AlertCircle size={size} />;
    case "alert_resolved": return <CheckCircle2 size={size} />;
    case "http_check":
    case "dns_check": return <Globe size={size} />;
    case "tcp_check":
    case "ping_check": return <Activity size={size} />;
    case "heartbeat_ping":
    case "heartbeat_missed":
    case "heartbeat_recovered": return <Heart size={size} />;
    case "pipeline": return <GitBranch size={size} />;
    case "server_online":
    case "server_offline": return <Server size={size} />;
    case "anomaly": return <AlertTriangle size={size} />;
    case "incident_created":
    case "incident_updated":
    case "incident_resolved": return <Bell size={size} />;
    default:
      return sev === "info" ? <Info size={size} /> : <Circle size={size} />;
  }
}

function sevClasses(sev: EventSeverity): string {
  switch (sev) {
    case "critical": return "border-red-500/40 bg-red-500/5 text-red-300";
    case "error":    return "border-red-400/30 bg-red-400/5 text-red-200";
    case "warning":  return "border-amber-400/30 bg-amber-400/5 text-amber-200";
    default:         return "border-gray-700 bg-gray-800/30 text-gray-200";
  }
}

function iconClasses(sev: EventSeverity): string {
  switch (sev) {
    case "critical": return "text-red-400";
    case "error":    return "text-red-300";
    case "warning":  return "text-amber-300";
    default:         return "text-emerald-300";
  }
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const now = Date.now();
  const diff = now - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleString();
}

function Timeline({ liveEvents }: TimelineProps) {
  const [items, setItems] = useState<EventRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const selectedKinds = useMemo<EventKind[]>(() => {
    const kinds: EventKind[] = [];
    for (const g of FILTER_GROUPS) {
      if (activeFilters.has(g.label)) kinds.push(...g.kinds);
    }
    return kinds;
  }, [activeFilters]);

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const resp = await fetchEvents({
        cursor: reset ? null : cursor,
        limit: 100,
        kinds: selectedKinds.length ? selectedKinds : undefined,
      });
      setItems((prev) => reset ? resp.items : [...prev, ...resp.items]);
      setCursor(resp.nextCursor);
      setHasMore(Boolean(resp.nextCursor));
    } finally {
      setLoading(false);
    }
  }, [cursor, selectedKinds]);

  // Reload whenever filters change
  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKinds.join(",")]);

  // Merge live events that match the current filter into the top of the list.
  const merged = useMemo<EventRecord[]>(() => {
    const live = selectedKinds.length
      ? liveEvents.filter((e) => selectedKinds.includes(e.kind))
      : liveEvents;
    const seen = new Set<string>();
    const out: EventRecord[] = [];
    for (const e of [...live, ...items]) {
      if (seen.has(e._id)) continue;
      seen.add(e._id);
      out.push(e);
    }
    return out.sort((a, b) => b.time - a.time);
  }, [items, liveEvents, selectedKinds]);

  function toggleFilter(label: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  return (
    <div>
      <PageHeader title="Timeline" subtitle="Unified event feed across every monitor">
        <button
          type="button"
          onClick={() => void load(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-gray-300 hover:text-white bg-gray-800/60 hover:bg-gray-700 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTER_GROUPS.map((g) => {
          const active = activeFilters.has(g.label);
          return (
            <button
              key={g.label}
              type="button"
              onClick={() => toggleFilter(g.label)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : "border-gray-700 bg-gray-800/40 text-gray-400 hover:text-gray-200"
              }`}
            >
              {g.label}
            </button>
          );
        })}
        {activeFilters.size > 0 && (
          <button
            type="button"
            onClick={() => setActiveFilters(new Set())}
            className="text-xs px-3 py-1.5 rounded-full border border-gray-700 bg-gray-800/40 text-gray-400 hover:text-gray-200"
          >
            Clear
          </button>
        )}
      </div>

      <div className="space-y-2">
        {merged.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-500 text-sm">No events yet.</div>
        )}
        {merged.map((e) => (
          <div
            key={e._id}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${sevClasses(e.severity)}`}
          >
            <div className={`mt-0.5 ${iconClasses(e.severity)}`}>{iconFor(e.kind, e.severity)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {KIND_LABELS[e.kind] ?? e.kind}
                </span>
                {e.source && (
                  <span className="text-[11px] text-gray-500">· {e.source}</span>
                )}
                {e.severity !== "info" && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-current">
                    {e.severity}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-gray-500">{formatTime(e.time)}</span>
              </div>
              <div className="text-sm text-gray-100 mt-0.5 truncate">{e.title}</div>
              {e.severity === "critical" && e.kind === "anomaly" && (
                <div className="mt-1 text-[11px] text-gray-400">
                  z={((e.detail as { zScore?: number }).zScore ?? 0).toFixed(2)} ·
                  value {((e.detail as { value?: number }).value ?? 0).toFixed(2)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {hasMore && merged.length > 0 && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void load(false)}
            disabled={loading}
            className="text-sm px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-60 text-gray-200 transition-colors"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {loading && merged.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
        </div>
      )}

      <p className="text-center text-[11px] text-gray-600 mt-6">
        Showing up to the latest {merged.length} events · newest at the top · live-updating
      </p>

      {/* incident icon imported but unused would fail TS; reference to keep clean */}
      <XCircle className="hidden" />
    </div>
  );
}

export default Timeline;
