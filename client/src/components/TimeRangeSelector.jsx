const RANGES = [
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
];

function TimeRangeSelector({ value, onChange }) {
  return (
    <div className="flex items-center bg-[#0d1117] border border-gray-800 rounded-lg p-0.5">
      {RANGES.map(({ value: v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
            value === v
              ? "bg-emerald-400/10 text-emerald-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default TimeRangeSelector;
