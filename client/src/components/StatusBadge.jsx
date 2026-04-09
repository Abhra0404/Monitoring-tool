function StatusBadge({ status }) {
  const config = {
    online: { color: "bg-emerald-400", text: "text-emerald-400", label: "Online", pulse: true },
    warning: { color: "bg-amber-400", text: "text-amber-400", label: "Warning", pulse: true },
    offline: { color: "bg-red-400", text: "text-red-400", label: "Offline", pulse: false },
  };

  const c = config[status] || config.offline;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.color} ${c.pulse ? "animate-pulse" : ""}`} />
      {c.label}
    </span>
  );
}

export default StatusBadge;
