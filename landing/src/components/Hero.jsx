import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Activity,
  AlertTriangle,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Sparkles,
  Star,
  Thermometer,
} from "lucide-react";
import { CopyButton, GitHubIcon, Section, StatusDot } from "../lib/ui.jsx";

/* ──────────────────────────────────────────────────────────────────────────
   Hero — production landing hero.

   Layout:
     • lg+ : two-column, text + sticky-feel live preview card.
     • md- : single column, preview hidden (DashboardDemo carries that load).

   Visual language:
     • Reuses existing tokens (.pill, .code-shell, .brand-glow, .signal,
       .sparkline) — no one-off styling.
     • Entrance: staggered Quint-Out, matches navbar timing language.
   ────────────────────────────────────────────────────────────────────────── */

const ease = [0.22, 1, 0.36, 1];

const TRUST = [
  { label: "Apache 2.0", sub: "license" },
  { label: "v1.0.4", sub: "released Apr 18" },
  { label: "Self-hosted", sub: "your data, your infra" },
];

export default function Hero() {
  return (
    <Section className="relative pt-16 pb-24 sm:pt-20 sm:pb-28 lg:pt-24 lg:pb-32">
      <div className="grid items-center gap-16 lg:grid-cols-12 lg:gap-12">
        {/* ── Left: messaging ─────────────────────────────────────────── */}
        <div className="relative lg:col-span-7">
          <motion.a
            href="https://github.com/Abhra0404/Monitoring-tool/releases"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease }}
            className="pill"
          >
            <Sparkles size={13} className="text-brand-bright" />
            <span className="text-fg-1">
              v1.0.4 — alerting, status pages, OTLP
            </span>
            <ArrowRight size={12} className="text-fg-3" />
          </motion.a>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease, delay: 0.06 }}
            className="heading-display mt-7 text-fg"
          >
            Monitoring without the{" "}
            <span className="bg-gradient-to-br from-white via-brand-bright to-brand bg-clip-text text-transparent">
              SaaS bill.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease, delay: 0.12 }}
            className="mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-fg-1"
          >
            Theoria is the open-source convergence of Uptime Kuma and Beszel —
            metrics, synthetic checks, alerting, incidents and a public status
            page in a single self-hosted binary.
          </motion.p>

          {/* Install command + CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease, delay: 0.18 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="code-shell brand-glow w-full sm:max-w-sm">
              <div className="flex items-center gap-3 px-4 py-[0.7rem]">
                <span className="select-none text-brand">$</span>
                <code className="flex-1 text-left text-fg">
                  npx theoria-cli<span className="caret" />
                </code>
                <CopyButton text="npx theoria-cli" />
              </div>
            </div>

            <a href="#install" className="btn btn-primary">
              Install guide
              <ArrowRight size={14} />
            </a>
          </motion.div>

          {/* Secondary actions */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease, delay: 0.24 }}
            className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-fg-2"
          >
            <a
              href="https://github.com/Abhra0404/Monitoring-tool"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-fg-1 hover:text-fg transition-colors"
            >
              <GitHubIcon size={14} />
              <span>Star on GitHub</span>
              <span className="inline-flex items-center gap-1 text-fg-2">
                <Star size={12} className="text-brand" /> 2.1k
              </span>
            </a>
            <a
              href="#docs"
              className="text-fg-1 hover:text-fg transition-colors"
            >
              Read the docs
            </a>
            <a
              href="#compare"
              className="text-fg-1 hover:text-fg transition-colors"
            >
              Compare vs. Datadog
            </a>
          </motion.div>

          {/* Trust strip */}
          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, ease, delay: 0.36 }}
            className="mt-12 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-stroke bg-stroke max-w-lg"
          >
            {TRUST.map((t) => (
              <div key={t.sub} className="bg-bg px-4 py-4">
                <dt className="font-mono text-sm text-fg">{t.label}</dt>
                <dd className="mt-0.5 text-[11px] uppercase tracking-wider text-fg-2">
                  {t.sub}
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* ── Right: live preview card ────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.18 }}
          className="hidden lg:col-span-5 lg:block"
        >
          <LivePreview />
        </motion.div>
      </div>
    </Section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Live preview — compact monitoring card. Two server rows + an alert toast.
   ────────────────────────────────────────────────────────────────────────── */
function LivePreview() {
  return (
    <div className="relative">
      {/* Floating alert toast — pinned top-right */}
      <motion.div
        initial={{ opacity: 0, x: 12, y: -8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.55, ease, delay: 0.7 }}
        className="absolute -right-3 -top-3 z-20 flex items-center gap-2.5 rounded-xl border border-alert/30 bg-surface-1/95 px-3.5 py-2.5 shadow-[0_20px_60px_-20px_rgba(244,63,94,0.4)] backdrop-blur-xl"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-alert/15">
          <AlertTriangle size={14} className="text-alert" />
        </span>
        <div className="text-left">
          <div className="text-[12px] font-medium text-fg">api-prod-01</div>
          <div className="text-[10.5px] text-fg-2">CPU 91% · 5m</div>
        </div>
      </motion.div>

      <div className="card brand-glow overflow-hidden">
        {/* Card chrome */}
        <div className="flex items-center justify-between border-b border-stroke bg-surface-1/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="signal" />
            <span className="font-mono text-[12px] text-fg-1">
              monitor.acme.com
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-fg-3">
            <Activity size={11} />
            <span>live</span>
          </div>
        </div>

        {/* Body */}
        <div className="divide-y divide-stroke">
          <ServerRow
            name="api-prod-01"
            region="us-east-1"
            cpu={91}
            tone="alert"
            sparkline={SPARK_HIGH}
          />
          <ServerRow
            name="db-replica-2"
            region="eu-west-1"
            cpu={34}
            tone="ok"
            sparkline={SPARK_OK}
          />
          <ServerRow
            name="edge-tokyo"
            region="ap-ne-1"
            cpu={58}
            tone="warn"
            sparkline={SPARK_WARN}
          />
        </div>

        {/* Footer summary */}
        <div className="flex items-center justify-between border-t border-stroke bg-surface/60 px-5 py-3 font-mono text-[11px] text-fg-2">
          <span>3 servers · 1 incident</span>
          <UptimeBlip />
        </div>
      </div>
    </div>
  );
}

function ServerRow({ name, region, cpu, tone, sparkline }) {
  const tint =
    tone === "alert"
      ? "text-alert"
      : tone === "warn"
      ? "text-warn"
      : "text-fg";
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="flex items-center gap-3 min-w-0">
        <StatusDot tone={tone === "alert" ? "alert" : tone === "warn" ? "warn" : "ok"} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-fg">{name}</div>
          <div className="truncate font-mono text-[11px] text-fg-2">
            {region}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <Sparkline points={sparkline} tone={tone} />
        <div className="flex items-center gap-1.5">
          <Cpu size={12} className="text-fg-3" />
          <span className={`font-mono text-sm tabular-nums ${tint}`}>
            {cpu}%
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Sparkline ─────────────────────────────────────────────────────────── */
const SPARK_OK   = [22, 26, 24, 30, 28, 32, 31, 35, 30, 34, 32, 38, 34];
const SPARK_WARN = [40, 44, 50, 47, 52, 58, 55, 60, 58, 62, 59, 64, 58];
const SPARK_HIGH = [62, 70, 75, 78, 80, 84, 79, 86, 88, 90, 89, 92, 91];

function Sparkline({ points, tone }) {
  const W = 86;
  const H = 22;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = Math.max(1, max - min);
  const step = W / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = H - ((p - min) / span) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const stroke =
    tone === "alert"
      ? "var(--color-alert)"
      : tone === "warn"
      ? "var(--color-warn)"
      : "var(--color-brand)";

  return (
    <svg
      className="sparkline"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        className="line"
        d={path}
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Footer uptime blip — animates a tiny percentage upward ─────────────── */
function UptimeBlip() {
  const [pct, setPct] = useState(99.94);
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => {
        const next = p + (Math.random() - 0.4) * 0.01;
        return Math.min(99.99, Math.max(99.9, Math.round(next * 100) / 100));
      });
    }, 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-fg-3">uptime</span>
      <span className="text-brand-bright tabular-nums">{pct.toFixed(2)}%</span>
    </span>
  );
}
