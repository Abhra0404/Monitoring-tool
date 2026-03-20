import { motion } from "framer-motion";

function MetricCard({ title, value, icon }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="bg-[#111827] p-4 rounded-xl border border-[#1F2937] flex justify-between shadow-[0_0_25px_rgba(0,255,198,0.15)]"
    >
      <div>
        <p className="text-gray-400">{title}</p>
        <h2 className="text-xl font-bold">{value}</h2>
      </div>
      <div className="text-[#00FFC6]">{icon}</div>
    </motion.div>
  );
}

export default MetricCard;
