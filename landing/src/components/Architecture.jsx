import { motion } from "framer-motion";
import { Section, SectionHead } from "../lib/ui.jsx";

const NODES = {
  agentLinux: { x: 60, y: 60, label: "agent · linux", sub: "Go · 10MB" },
  agentMac: { x: 60, y: 140, label: "agent · macOS", sub: "Go · 10MB" },
  agentWin: { x: 60, y: 220, label: "agent · windows", sub: "Go · 10MB" },
  otlp: { x: 60, y: 300, label: "OTLP collector", sub: "any vendor" },

  fastify: { x: 380, y: 80, label: "Fastify API", sub: "REST + WS" },
  ws: { x: 380, y: 160, label: "Socket.IO bus", sub: "Redis adapter" },
  alert: { x: 380, y: 240, label: "Alert engine", sub: "+ anomaly z-score" },
  status: { x: 380, y: 320, label: "Status page", sub: "Caddy on-demand TLS" },

  pg: { x: 720, y: 100, label: "PostgreSQL", sub: "+ TimescaleDB" },
  redis: { x: 720, y: 200, label: "Redis", sub: "pub/sub · breach state" },
  notif: { x: 720, y: 300, label: "Notifications", sub: "20+ channels (v2)" },
};

function Node({ node, accent = "default", id }) {
  const palette =
    accent === "core"
      ? "border-brand-line bg-brand-soft text-brand-bright"
      : accent === "edge"
      ? "border-stroke-1 bg-surface-2 text-fg-1"
      : "border-stroke-1 bg-surface-1 text-fg-1";
  return (
    <g id={id}>
      <rect
        x={node.x}
        y={node.y}
        rx={10}
        ry={10}
        width={180}
        height={56}
        className={`fill-transparent ${palette}`}
        style={{
          stroke: "currentColor",
          strokeOpacity: 0.45,
          fill: accent === "core" ? "rgba(52,211,153,0.07)" : "rgba(22,25,29,0.85)",
        }}
      />
      <text x={node.x + 14} y={node.y + 24} className="font-mono fill-current" style={{ fontSize: 13, fontWeight: 600 }}>
        {node.label}
      </text>
      <text x={node.x + 14} y={node.y + 42} style={{ fontSize: 11, fill: "#8a8f98" }}>
        {node.sub}
      </text>
    </g>
  );
}

function Edge({ from, to, dashed = false }) {
  // route as horizontal step: from-right -> mid-x -> to-left
  const fx = from.x + 180;
  const fy = from.y + 28;
  const tx = to.x;
  const ty = to.y + 28;
  const midX = (fx + tx) / 2;
  const d = `M ${fx} ${fy} C ${midX} ${fy}, ${midX} ${ty}, ${tx} ${ty}`;
  return (
    <path
      d={d}
      fill="none"
      stroke="#34d399"
      strokeOpacity="0.45"
      strokeWidth="1.2"
      strokeDasharray={dashed ? "3 4" : undefined}
      markerEnd="url(#arrow)"
    />
  );
}

export default function Architecture() {
  return (
    <Section id="architecture" className="py-24 sm:py-32 border-t border-stroke">
      <SectionHead
        align="center"
        eyebrow="Architecture"
        title="Boring on purpose."
        kicker="One Fastify process serves the API, the dashboard and the WebSocket bus. State lives in your store of choice. Agents push, the engine fans out — that's the whole system."
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="mt-14 overflow-hidden rounded-2xl border border-stroke bg-surface"
      >
        <div className="dot-bg p-4 sm:p-8">
          <svg viewBox="0 0 920 400" className="w-full" role="img" aria-label="Theoria architecture diagram">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#34d399" fillOpacity="0.6" />
              </marker>
              <linearGradient id="zone" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#16191d" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#16191d" stopOpacity="0.2" />
              </linearGradient>
            </defs>

            {/* Zones */}
            <rect x="40" y="30" width="220" height="350" rx="14" fill="url(#zone)" stroke="#1d2024" />
            <rect x="360" y="50" width="220" height="320" rx="14" fill="rgba(52,211,153,0.04)" stroke="rgba(52,211,153,0.18)" />
            <rect x="700" y="70" width="220" height="290" rx="14" fill="url(#zone)" stroke="#1d2024" />

            <text x="150" y="22" textAnchor="middle" style={{ fontSize: 11, fill: "#8a8f98", letterSpacing: "0.05em" }}>
              EDGE
            </text>
            <text x="470" y="42" textAnchor="middle" style={{ fontSize: 11, fill: "#34d399", letterSpacing: "0.05em" }}>
              THEORIA SERVER
            </text>
            <text x="810" y="62" textAnchor="middle" style={{ fontSize: 11, fill: "#8a8f98", letterSpacing: "0.05em" }}>
              STATE & DELIVERY
            </text>

            {/* Edges */}
            <Edge from={NODES.agentLinux} to={NODES.fastify} />
            <Edge from={NODES.agentMac} to={NODES.fastify} />
            <Edge from={NODES.agentWin} to={NODES.fastify} />
            <Edge from={NODES.otlp} to={NODES.alert} dashed />

            <Edge from={NODES.fastify} to={NODES.pg} />
            <Edge from={NODES.ws} to={NODES.redis} />
            <Edge from={NODES.alert} to={NODES.notif} />
            <Edge from={NODES.alert} to={NODES.redis} />
            <Edge from={NODES.status} to={NODES.pg} />

            {/* Edge nodes */}
            <Node node={NODES.agentLinux} accent="edge" />
            <Node node={NODES.agentMac} accent="edge" />
            <Node node={NODES.agentWin} accent="edge" />
            <Node node={NODES.otlp} accent="edge" />

            {/* Core */}
            <Node node={NODES.fastify} accent="core" />
            <Node node={NODES.ws} accent="core" />
            <Node node={NODES.alert} accent="core" />
            <Node node={NODES.status} accent="core" />

            {/* State */}
            <Node node={NODES.pg} accent="edge" />
            <Node node={NODES.redis} accent="edge" />
            <Node node={NODES.notif} accent="edge" />
          </svg>
        </div>

        <div className="grid gap-px border-t border-stroke bg-stroke sm:grid-cols-3">
          {[
            { k: "Server", v: "Fastify · TypeScript · Pino · Sentry" },
            { k: "State", v: "in-memory + JSON · Postgres · Timescale" },
            { k: "Realtime", v: "Socket.IO + Redis adapter" },
          ].map((s) => (
            <div key={s.k} className="bg-surface px-5 py-4">
              <div className="text-xs uppercase tracking-wider text-fg-2">{s.k}</div>
              <div className="mt-1 font-mono text-[13px] text-fg">{s.v}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </Section>
  );
}
