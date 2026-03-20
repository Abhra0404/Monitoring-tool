import { ResponsiveContainer } from "recharts";

function ChartCard({ title, children }) {
  return (
    <div className="bg-[#111827] p-4 rounded-xl border border-[#1F2937]">
      <h3 className="mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={250}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export default ChartCard;
