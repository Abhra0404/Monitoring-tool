import { motion } from "framer-motion";
import { Activity, Bell, Plug, ShieldCheck } from "lucide-react";
import { Section, SectionHead } from "../lib/ui.jsx";

const EASE = [0.16, 1, 0.3, 1];
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: EASE, delay },
});

/* ───────────────── pillars ───────────────── */

const PILLARS = [
  {
    icon: Activity,
    eyebrow: "observe",
    title: "Every signal, one timeline.",
    body: "CPU, memory, disk, network and Docker stats from a 10MB Go agent — plus synthetic checks, OTLP and Prometheus scrape.",
    bullets: ["5s cadence", "8 check types", "OTLP + Prom"],
    accent: true,
  },
  {
    icon: Bell,
    eyebrow: "alert",
    title: "Rules as data.",
    body: "Threshold + duration + label match. Severity from breach ratio. Redis-mirrored state for HA fan-out to Slack and PagerDuty.",
    bullets: ["YAML rules", "Z-score anomaly", "HA breach state"],
  },
  {
    icon: ShieldCheck,
    eyebrow: "communicate",
    title: "Status pages built in.",
    body: "Custom domain with on-demand TLS via Caddy. RSS, SVG badges and incident updates — no third-party plan required.",
    bullets: ["Auto TLS", "RSS + badges", "Incident timeline"],
  },
  {
    icon: Plug,
    eyebrow: "extend",
    title: "Drop a folder, ship a collector.",
    body: "Sandboxed Node plugins with a single manifest. Postgres, Redis, MySQL, MongoDB and nginx ship in the box, hot-reloaded.",
    bullets: ["5 built-in", "Hot reload", "Sandboxed"],
  },
];

function Pillar({ icon: Icon, eyebrow, title, body, bullets, accent, idx }) {
  return (
    <motion.div
      {...fadeUp(idx * 0.05)}
      className={`card card-glow group relative overflow-hidden p-6 ${accent ? "brand-glow" : ""}`}
    >
      {accent && (
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, rgba(52,211,153,0.16), transparent 70%)",
          }}
          aria-hidden="true"
        />
      )}
      {!accent && (
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full opacity-60 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(closest-side, rgba(52,211,153,0.10), transparent 70%)",
          }}
          aria-hidden="true"
        />
      )}
      <div className="relative">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${
              accent
                ? "border-brand-line bg-brand-soft text-brand-bright"
                : "border-stroke-1 bg-surface-2 text-fg-1"
            }`}
          >
            <Icon size={16} />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-3">
            {eyebrow}
          </span>
        </div>

        <h3 className="mt-4 text-lg font-semibold tracking-tight text-fg">
          {title}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-1">{body}</p>

        <ul className="mt-4 flex flex-wrap gap-1.5">
          {bullets.map((b) => (
            <li
              key={b}
              className="rounded-md border border-stroke-1 bg-surface-1 px-2 py-1 font-mono text-[11px] text-fg-1"
            >
              {b}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

/* ───────────────── section ───────────────── */

export default function Features() {
  return (
    <Section id="features" className="relative py-20 sm:py-24">
      <div
        className="absolute inset-x-0 top-0 -z-10 mx-auto h-60 max-w-4xl bg-gradient-to-b from-brand/10 to-transparent blur-3xl"
        aria-hidden="true"
      />

      <SectionHead
        eyebrow="Features"
        title="A complete monitoring stack — without the kubernetes."
        kicker="Three products in one install. Nothing locked behind a paid tier or a cloud signup."
      />

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {PILLARS.map((p, i) => (
          <Pillar key={p.eyebrow} {...p} idx={i} />
        ))}
      </div>
    </Section>
  );
}
