import { useEffect, useState, type ReactNode } from "react";
import { Activity, CheckCircle, XCircle, AlertTriangle, RefreshCw, Rss } from "lucide-react";
import { fetchPublicStatus, fetchUptimeHistory } from "../services/api";
import type { PublicStatus as PublicStatusData, UptimeSeries } from "../types";

const OVERALL_STYLES: Record<string, {
  bg: string;
  text: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = {
  operational:    { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", label: "All Systems Operational", Icon: CheckCircle },
  degraded:       { bg: "bg-amber-500/10 border-amber-500/20",     text: "text-amber-400",   label: "Degraded Performance",    Icon: AlertTriangle },
  partial_outage: { bg: "bg-amber-500/10 border-amber-500/20",     text: "text-amber-400",   label: "Partial Outage",          Icon: AlertTriangle },
  major_outage:   { bg: "bg-red-500/10 border-red-500/20",         text: "text-red-400",     label: "Major Outage",            Icon: XCircle },
};

function ServiceGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h2>
      <div className="bg-[#0d1117] rounded-xl border border-gray-800 divide-y divide-gray-800/50">
        {children}
      </div>
    </div>
  );
}

function ServiceRow({ name, status, detail }: { name: string; status: string; detail?: string }) {
  const statusConfig: Record<string, { dot: string; label: string }> = {
    operational: { dot: "bg-emerald-400", label: "Operational" },
    up:          { dot: "bg-emerald-400", label: "Operational" },
    degraded:    { dot: "bg-amber-400",   label: "Degraded"    },
    down:        { dot: "bg-red-400",     label: "Down"        },
  };
  const cfg = statusConfig[status] ?? statusConfig.down;
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className="text-sm text-gray-200">{name}</span>
      <div className="flex items-center gap-3">
        {detail && <span className="text-xs text-gray-500">{detail}</span>}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{cfg.label}</span>
          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
        </div>
      </div>
    </div>
  );
}

function PublicStatus() {
  const [data, setData] = useState<PublicStatusData | null>(null);
  const [uptime, setUptime] = useState<UptimeSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => void loadData(), 30_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    try {
      const [result, history] = await Promise.all([
        fetchPublicStatus() as Promise<PublicStatusData>,
        fetchUptimeHistory(90).catch(() => ({ days: 90, checks: [] as UptimeSeries[] })),
      ]);
      setData(result);
      setUptime(history.checks);
      setError(null);
      setLastUpdated(new Date());
    } catch {
      if (!data) setError("Status page is not available");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#010409] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-[#010409] flex items-center justify-center">
        <div className="text-center">
          <XCircle size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-lg">{error}</p>
          <p className="text-gray-600 text-sm mt-2">This status page may not be enabled</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const style = OVERALL_STYLES[data.overall] ?? OVERALL_STYLES.operational;

  return (
    <div className="min-h-screen bg-[#010409] text-gray-100">
      <header className="border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-emerald-400" size={24} />
            <span className="text-xl font-bold tracking-tight">{data.title ?? "System Status"}</span>
          </div>
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <RefreshCw size={12} />
              Updated {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {data.description && <p className="text-gray-400 text-sm mb-6">{data.description}</p>}

        <div className={`${style.bg} border rounded-xl p-6 flex items-center gap-4 mb-8`}>
          <style.Icon size={28} className={style.text} />
          <span className={`text-lg font-semibold ${style.text}`}>{style.label}</span>
        </div>

        {data.activeIncidents && data.activeIncidents.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Active Incidents</h2>
            <div className="space-y-3">
              {data.activeIncidents.map((inc) => (
                <div key={inc._id} className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertTriangle size={16} className="text-amber-400" />
                    <span className="font-semibold text-gray-100">{inc.title}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">
                      {inc.status}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-gray-700 bg-gray-800/40 text-gray-300">
                      {inc.severity}
                    </span>
                  </div>
                  {inc.services.length > 0 && (
                    <div className="text-[11px] text-gray-500 mt-1">Impacts: {inc.services.join(", ")}</div>
                  )}
                  <ol className="mt-3 space-y-2 border-l-2 border-gray-700/80 ml-1">
                    {inc.updates.map((u) => (
                      <li key={u._id} className="relative pl-4">
                        <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-amber-400" />
                        <div className="text-[11px] text-gray-500">
                          {new Date(u.createdAt).toLocaleString()} · {u.status}
                        </div>
                        <p className="text-sm text-gray-200">{u.message}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.servers?.length > 0 && (
          <ServiceGroup title="Infrastructure">
            {data.servers.map((s, i) => (
              <ServiceRow
                key={i}
                name={s.name}
                status={s.status === "online" ? "operational" : s.status === "warning" ? "degraded" : "down"}
              />
            ))}
          </ServiceGroup>
        )}

        {data.httpChecks?.length > 0 && (
          <ServiceGroup title="Websites & APIs">
            {data.httpChecks.map((c, i) => (
              <ServiceRow
                key={i}
                name={c.name}
                status={c.status === "up" ? "operational" : c.status === "degraded" ? "degraded" : "down"}
                detail={c.uptimePercent != null ? `${c.uptimePercent.toFixed(1)}% uptime` : undefined}
              />
            ))}
          </ServiceGroup>
        )}

        {uptime.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">90-Day Uptime</h2>
            <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 space-y-4">
              {uptime.map((series) => {
                const hasSamples = series.days.filter((d) => d.uptimePercent >= 0);
                const avg = hasSamples.length === 0
                  ? null
                  : hasSamples.reduce((s, d) => s + d.uptimePercent, 0) / hasSamples.length;
                return (
                  <div key={series.checkId}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-sm text-gray-200 truncate">{series.name}</div>
                      <div className="text-xs text-gray-500">
                        {avg != null ? `${avg.toFixed(2)}% avg` : "no samples"}
                      </div>
                    </div>
                    <div className="flex gap-[2px] h-8">
                      {series.days.map((d) => {
                        let bg = "bg-gray-800";
                        if (d.uptimePercent >= 99.9) bg = "bg-emerald-400";
                        else if (d.uptimePercent >= 99) bg = "bg-emerald-500/80";
                        else if (d.uptimePercent >= 95) bg = "bg-amber-400";
                        else if (d.uptimePercent >= 0) bg = "bg-red-400";
                        return (
                          <div
                            key={d.date}
                            className={`flex-1 rounded-sm ${bg}`}
                            title={`${d.date}: ${d.uptimePercent >= 0 ? `${d.uptimePercent.toFixed(2)}% (${d.samples} samples)` : "no data"}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-gray-500 pt-2">
                Each bar represents one day. Green = 99.9%+ uptime, amber = minor issues, red = outages, grey = no samples.
              </p>
            </div>
          </section>
        )}

        {data.customServices?.length > 0 && (
          <ServiceGroup title="Services">
            {data.customServices.map((s, i) => (
              <ServiceRow key={i} name={s.name} status={s.status} />
            ))}
          </ServiceGroup>
        )}

        {!data.servers?.length && !data.httpChecks?.length && !data.customServices?.length && (
          <div className="text-center py-12">
            <p className="text-gray-500">No services are being monitored yet</p>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            Powered by <Activity size={12} className="text-emerald-400" /> Theoria
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <a
              href="/api/status-page/public/rss"
              className="flex items-center gap-1 hover:text-gray-400"
              title="Subscribe via RSS"
            >
              <Rss size={12} />
              RSS
            </a>
            <span>Auto-refreshes every 30s</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default PublicStatus;
