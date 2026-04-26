import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import {
  Activity,
  AlertCircle,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Network,
  ShieldCheck,
  Wifi,
  Zap,
} from "lucide-react";
import { Section, SectionHead, StatusDot } from "../lib/ui.jsx";

/* ───────────────── Live ticking values ───────────────── */
function useTicker(initial, { min, max, step }) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => {
      setV((prev) => {
        const delta = (Math.random() - 0.5) * step * 2;
        const next = Math.max(min, Math.min(max, prev + delta));
        return Math.round(next * 10) / 10;
      });
    }, 1500);
    return () => clearInterval(id);
  }, [min, max, step]);
  return v;
}

function MetricCard({ icon: Icon, label, value, unit, percent, accent = "brand" }) {
  const accentClass =
    accent === "data"
      ? "from-data to-data/30"
      : accent === "alert"
      ? "from-alert to-alert/30"
      : "from-brand to-brand/30";
  return (
    <div className="rounded-xl border border-stroke bg-surface-1 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-2">
          {label}
        </span>
        <Icon size={14} className="text-fg-3" />
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-mono text-2xl font-medium tabular-nums text-fg">
          {value}
        </span>
        {unit && <span className="text-xs text-fg-2">{unit}</span>}
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-stroke/60">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${accentClass}`}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

/* ───────────────── Sparkline (60 points) ───────────────── */
// Deterministic pseudo-noise so React's purity rules are happy
// and the chart looks identical across renders.
function noiseAt(i, seed = 0) {
  const s = Math.sin((i + seed * 137.13) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

const PROFILES = {
  // Original hero shape — broad dip in the middle.
  cpu:   { wave1: [6, 18], wave2: [17, 6],  drift: { center: 0.55, depth: -25, width: 2.6 }, base: 90, jitter: 5 },
  // Memory creeps up, occasional reclaim.
  mem:   { wave1: [3, 8],  wave2: [11, 3],  drift: { center: 0.7,  depth:  18, width: 1.8 }, base: 70, jitter: 3 },
  // Bursty network traffic.
  netIn: { wave1: [9, 22], wave2: [21, 9],  drift: { center: 0.45, depth: -15, width: 3.2 }, base: 80, jitter: 8 },
  netOut:{ wave1: [7, 14], wave2: [19, 5],  drift: { center: 0.65, depth: -10, width: 2.4 }, base: 95, jitter: 6 },
  // Spiky disk I/O.
  io:    { wave1: [11, 28],wave2: [25, 10], drift: { center: 0.5,  depth:  -8, width: 4 },   base: 85, jitter: 12 },
};

function Sparkline({
  width = 720,
  height = 160,
  seed = 0,
  color = "#34d399",
  profile = "cpu",
  gridLines = [40, 80, 120],
  showEndDot = true,
  fillId,
}) {
  const cfg = PROFILES[profile] || PROFILES.cpu;
  const path = useMemo(() => {
    const points = 60;
    const ys = Array.from({ length: points }, (_, i) => {
      const x = i / (points - 1);
      const wave =
        Math.sin(x * cfg.wave1[0] + seed) * cfg.wave1[1] +
        Math.sin(x * cfg.wave2[0] + seed * 1.7) * cfg.wave2[1];
      const drift =
        cfg.drift.depth *
        Math.exp(-Math.pow((x - cfg.drift.center) * cfg.drift.width, 2));
      return cfg.base + wave + drift + (noiseAt(i, seed) - 0.5) * cfg.jitter;
    });
    const stepX = width / (points - 1);
    let d = `M0,${ys[0].toFixed(1)}`;
    for (let i = 1; i < points; i++) {
      d += ` L${(i * stepX).toFixed(1)},${ys[i].toFixed(1)}`;
    }
    return { d, last: ys[ys.length - 1] };
  }, [width, seed, cfg]);

  const gradId = fillId || `sparkFill-${profile}-${seed}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="sparkline w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridLines.map((y) => (
        <line key={y} x1="0" y1={y} x2={width} y2={y} stroke="#1d2024" strokeDasharray="2 4" />
      ))}
      <path d={`${path.d} L${width},${height} L0,${height} Z`} fill={`url(#${gradId})`} />
      <path className="line" d={path.d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {showEndDot && (
        <>
          <circle cx={width} cy={path.last} r="3" fill={color} />
          <circle cx={width} cy={path.last} r="7" fill={color} fillOpacity="0.18" />
        </>
      )}
    </svg>
  );
}

/* ───────────────── Mini chart card ───────────────── */
function MiniChart({ title, value, unit, delta, color, profile, seed }) {
  return (
    <div className="rounded-xl border border-stroke bg-surface-1 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h5 className="text-[12px] font-semibold text-fg">{title}</h5>
          <p className="mt-0.5 font-mono text-[10.5px] text-fg-2">last 60 min</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm font-medium tabular-nums text-fg">
            {value}
            {unit && <span className="ml-0.5 text-[11px] text-fg-2">{unit}</span>}
          </div>
          {delta && (
            <div
              className={`text-[10px] ${
                delta.startsWith("↓") ? "text-brand" : delta.startsWith("↑") ? "text-warn" : "text-fg-2"
              }`}
            >
              {delta}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2">
        <Sparkline
          width={360}
          height={70}
          color={color}
          profile={profile}
          seed={seed}
          gridLines={[20, 50]}
          showEndDot={false}
        />
      </div>
    </div>
  );
}

/* ───────────────── Check rows panel ───────────────── */
const CHECK_ROWS = [
  { name: "api.acme.com", type: "HTTPS", status: "ok", latency: 142, region: "iad" },
  { name: "redis-cache:6379", type: "TCP", status: "warn", latency: 38, region: "iad" },
  { name: "checkout.acme.com", type: "HTTPS", status: "alert", latency: 0, region: "fra" },
];

function ChecksPanel() {
  return (
    <div className="rounded-xl border border-stroke bg-surface-1">
      <header className="flex items-center justify-between border-b border-stroke px-4 py-3">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-fg-2" />
          <h4 className="text-sm font-semibold text-fg">Synthetic checks</h4>
          <span className="rounded-md border border-stroke-1 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-2">
            3 / 12 monitors
          </span>
        </div>
        <span className="font-mono text-xs text-fg-2">last 5m</span>
      </header>
      <ul className="divide-y divide-stroke">
        {CHECK_ROWS.map((c) => (
          <li key={c.name} className="grid grid-cols-[auto,1fr,auto,auto] items-center gap-3 px-4 py-2.5">
            <StatusDot tone={c.status} />
            <div className="min-w-0">
              <div className="truncate font-mono text-[13px] text-fg">{c.name}</div>
              <div className="text-[11px] text-fg-2">{c.type} · {c.region}</div>
            </div>
            <span className="font-mono text-xs tabular-nums text-fg-1">
              {c.status === "alert" ? "—" : `${c.latency}ms`}
            </span>
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                c.status === "ok"
                  ? "border border-brand-line bg-brand-soft text-brand-bright"
                  : c.status === "warn"
                  ? "border border-warn/30 bg-warn/10 text-warn"
                  : "border border-alert/30 bg-alert-soft text-alert"
              }`}
            >
              {c.status === "ok" ? "up" : c.status === "warn" ? "slow" : "down"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────── Alert toast ───────────────── */
function AlertToast() {
  return (
    <div className="rounded-xl border border-alert/30 bg-alert-soft p-4 backdrop-blur">
      <div className="flex items-start gap-3">
        <AlertCircle size={16} className="mt-0.5 text-alert" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg">Incident triggered</span>
            <span className="rounded-md border border-alert/30 bg-alert/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-alert">
              critical
            </span>
          </div>
          <p className="mt-1 font-mono text-[12px] text-fg-1">
            checkout.acme.com · HTTPS · 5xx for 90s
          </p>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-fg-2">
            <span>→ slack #ops</span>
            <span>→ pagerduty</span>
            <span>→ status page</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardDemo() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const cpu = useTicker(23.4, { min: 12, max: 48, step: 1.2 });
  const mem = useTicker(38.2, { min: 30, max: 55, step: 0.6 });
  const disk = useTicker(27.7, { min: 26, max: 31, step: 0.2 });
  const net = useTicker(2.4, { min: 0.4, max: 8, step: 0.6 });

  return (
    <Section id="product" className="relative py-24 sm:py-32">
      <div className="absolute inset-x-0 top-0 -z-10 mx-auto h-72 max-w-4xl bg-gradient-to-b from-brand/10 to-transparent blur-3xl" aria-hidden="true" />
      <SectionHead
        align="center"
        eyebrow="The dashboard"
        title="Servers and services in one console."
        kicker="Live metrics, synthetic checks, alerts and incidents — every signal flows through one event timeline you can subscribe to over WebSocket or scrape with Prometheus."
      />

      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="mt-14 overflow-hidden rounded-2xl border border-stroke bg-surface brand-glow"
      >
        {/* Window chrome */}
        <div className="terminal-chrome">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
          <div className="ml-3 flex items-center gap-2 text-xs text-fg-2">
            <span className="font-mono">theoria.local</span>
            <span className="text-fg-4">/</span>
            <span>overview</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <StatusDot tone="ok" />
            <span className="text-fg-1">all systems operational</span>
          </div>
        </div>

        {/* Body */}
        <div className="grid gap-4 bg-bg p-4 sm:p-6 lg:grid-cols-12">
          {/* Left column: metrics + chart */}
          <div className="space-y-4 lg:col-span-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard icon={Cpu} label="CPU" value={cpu.toFixed(1)} unit="%" percent={cpu * 2} />
              <MetricCard icon={HardDrive} label="Memory" value={mem.toFixed(1)} unit="%" percent={mem * 1.5} accent="data" />
              <MetricCard icon={Database} label="Disk" value={disk.toFixed(1)} unit="%" percent={disk * 2} />
              <MetricCard icon={Network} label="Net" value={net.toFixed(1)} unit="MB/s" percent={net * 12} accent="data" />
            </div>

            <div className="rounded-xl border border-stroke bg-surface-1 p-4 sm:p-5">
              <div className="flex items-end justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-fg">CPU · prod-iad-01</h4>
                  <p className="mt-0.5 text-xs text-fg-2">last 60 min · 5s cadence · 720 points</p>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-medium tabular-nums text-fg">{cpu.toFixed(1)}%</div>
                  <div className="text-[11px] text-brand">↓ 2.1% from 1h avg</div>
                </div>
              </div>
              <div className="mt-3">
                <Sparkline />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MiniChart
                title="Memory"
                value={mem.toFixed(1)}
                unit="%"
                delta="↑ 1.8% vs 1h"
                color="#a78bfa"
                profile="mem"
                seed={1}
              />
              <MiniChart
                title="Network · in"
                value={net.toFixed(1)}
                unit="MB/s"
                delta="↓ 0.4 vs 1h"
                color="#34d399"
                profile="netIn"
                seed={2}
              />
              <MiniChart
                title="Network · out"
                value={(net * 0.62).toFixed(1)}
                unit="MB/s"
                delta="↑ 0.2 vs 1h"
                color="#a78bfa"
                profile="netOut"
                seed={3}
              />
              <MiniChart
                title="Disk I/O"
                value="612"
                unit="iops"
                delta="↑ 8% vs 1h"
                color="#f59e0b"
                profile="io"
                seed={4}
              />
            </div>
          </div>

          {/* Right column: checks + status */}
          <div className="space-y-4 lg:col-span-4">
            <ChecksPanel />
            <div className="rounded-xl border border-stroke bg-surface-1 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-brand" />
                <h4 className="text-sm font-semibold text-fg">Status page</h4>
              </div>
              <p className="mt-1 text-xs text-fg-2">
                status.acme.com · 90-day uptime
              </p>
              <div
                className="mt-3 grid gap-[2px]"
                style={{ gridTemplateColumns: "repeat(30, minmax(0, 1fr))" }}
              >
                {Array.from({ length: 90 }).map((_, i) => {
                  const tone = i === 64 ? "alert" : i === 71 || i === 72 ? "warn" : "ok";
                  const color = tone === "ok" ? "bg-brand/70" : tone === "warn" ? "bg-warn/70" : "bg-alert/80";
                  return <span key={i} className={`h-5 rounded-sm ${color}`} aria-hidden="true" />;
                })}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[10px] text-fg-2">
                <span>90d ago</span>
                <span>99.94% uptime</span>
                <span>today</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stroke bg-surface-1/50 px-4 py-2.5 text-xs text-fg-2">
          <div className="flex items-center gap-3 font-mono">
            <span className="flex items-center gap-1.5">
              <Zap size={12} className="text-brand" />
              ws://theoria.local · 8 subscribers
            </span>
            <span className="text-fg-4">·</span>
            <span>p99 ingest 11ms</span>
          </div>
          <div className="flex items-center gap-3 font-mono">
            <span className="flex items-center gap-1.5">
              <Activity size={12} />
              12.4k metrics/min
            </span>
            <span className="text-fg-4">·</span>
            <span>1 firing · 1 silenced</span>
          </div>
        </div>
      </motion.div>
    </Section>
  );
}
