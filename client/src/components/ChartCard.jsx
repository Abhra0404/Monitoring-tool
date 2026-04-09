import { ResponsiveContainer } from "recharts";

function ChartCard({ title, subtitle, children, className = "", height = 280 }) {
  return (
    <div className={`bg-[#0d1117] rounded-xl border border-gray-800 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-gray-800/50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-200">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="px-2 py-3">
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ChartCard;
