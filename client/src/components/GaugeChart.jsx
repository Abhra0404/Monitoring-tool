function GaugeChart({ value = 0, max = 100, size = 80, strokeWidth = 6, color = "#34d399" }) {
  const safeMax = max > 0 ? max : 100;
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const getColor = () => {
    if (pct > 90) return "#ef4444";
    if (pct > 70) return "#f59e0b";
    return color;
  };

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-xs font-bold text-gray-200">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

export default GaugeChart;
