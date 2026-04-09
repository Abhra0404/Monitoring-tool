function MetricCard({ title, value, subtitle, icon, color = "emerald", trend }) {
  const colorMap = {
    emerald: { bg: "bg-emerald-400/10", text: "text-emerald-400", ring: "ring-emerald-400/20" },
    amber: { bg: "bg-amber-400/10", text: "text-amber-400", ring: "ring-amber-400/20" },
    red: { bg: "bg-red-400/10", text: "text-red-400", ring: "ring-red-400/20" },
    blue: { bg: "bg-blue-400/10", text: "text-blue-400", ring: "ring-blue-400/20" },
    purple: { bg: "bg-purple-400/10", text: "text-purple-400", ring: "ring-purple-400/20" },
    cyan: { bg: "bg-cyan-400/10", text: "text-cyan-400", ring: "ring-cyan-400/20" },
  };
  const c = colorMap[color] || colorMap.emerald;

  return (
    <div className={`bg-[#0d1117] rounded-xl border border-gray-800 p-4 ring-1 ${c.ring} transition-all hover:border-gray-700`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${c.text}`}>{value}</p>
          {subtitle && (
            <p className="text-[11px] text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`${c.bg} p-2 rounded-lg`}>
          <div className={c.text}>{icon}</div>
        </div>
      </div>
      {trend !== undefined && (
        <div className="mt-3 pt-3 border-t border-gray-800/50">
          <span className={`text-xs ${trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
          </span>
          <span className="text-xs text-gray-600 ml-1">vs 5m ago</span>
        </div>
      )}
    </div>
  );
}

export default MetricCard;
