import { useEffect, useState } from "react";
import { Activity, CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { fetchPublicStatus } from "../services/api";

const OVERALL_STYLES = {
  operational: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", label: "All Systems Operational", Icon: CheckCircle },
  degraded: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", label: "Degraded Performance", Icon: AlertTriangle },
  partial_outage: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", label: "Partial Outage", Icon: AlertTriangle },
  major_outage: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", label: "Major Outage", Icon: XCircle },
};

function PublicStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const result = await fetchPublicStatus();
      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!data) {
        setError("Status page is not available");
      }
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

  const style = OVERALL_STYLES[data.overall] || OVERALL_STYLES.operational;

  return (
    <div className="min-h-screen bg-[#010409] text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-emerald-400" size={24} />
            <span className="text-xl font-bold tracking-tight">
              {data.title || "System Status"}
            </span>
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
        {data.description && (
          <p className="text-gray-400 text-sm mb-6">{data.description}</p>
        )}

        {/* Overall Status Banner */}
        <div className={`${style.bg} border rounded-xl p-6 flex items-center gap-4 mb-8`}>
          <style.Icon size={28} className={style.text} />
          <span className={`text-lg font-semibold ${style.text}`}>{style.label}</span>
        </div>

        {/* Servers */}
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

        {/* HTTP Checks */}
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

        {/* Custom Services */}
        {data.customServices?.length > 0 && (
          <ServiceGroup title="Services">
            {data.customServices.map((s, i) => (
              <ServiceRow key={i} name={s.name} status={s.status} />
            ))}
          </ServiceGroup>
        )}

        {/* Empty state */}
        {!data.servers?.length && !data.httpChecks?.length && !data.customServices?.length && (
          <div className="text-center py-12">
            <p className="text-gray-500">No services are being monitored yet</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            Powered by <Activity size={12} className="text-emerald-400" /> Theoria
          </div>
          <p className="text-xs text-gray-600">Auto-refreshes every 30s</p>
        </div>
      </footer>
    </div>
  );
}

function ServiceGroup({ title, children }) {
  return (
    <div className="mb-6">
      <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h2>
      <div className="bg-[#0d1117] rounded-xl border border-gray-800 divide-y divide-gray-800/50">
        {children}
      </div>
    </div>
  );
}

function ServiceRow({ name, status, detail }) {
  const statusConfig = {
    operational: { dot: "bg-emerald-400", label: "Operational" },
    up: { dot: "bg-emerald-400", label: "Operational" },
    degraded: { dot: "bg-amber-400", label: "Degraded" },
    down: { dot: "bg-red-400", label: "Down" },
  };

  const cfg = statusConfig[status] || statusConfig.down;

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

export default PublicStatus;
