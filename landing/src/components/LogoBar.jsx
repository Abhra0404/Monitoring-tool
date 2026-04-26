import { Section } from "../lib/ui.jsx";

const ITEMS = [
  "OpenTelemetry / OTLP",
  "Prometheus exposition",
  "PostgreSQL + TimescaleDB",
  "Redis pub/sub adapter",
  "Docker / Compose",
  "Kubernetes Helm chart",
  "systemd / launchd",
  "GitHub Actions",
  "Caddy on-demand TLS",
  "Sentry integration",
];

export default function LogoBar() {
  const items = [...ITEMS, ...ITEMS];
  return (
    <Section className="py-12 border-y border-stroke bg-surface/40">
      <div className="flex flex-col items-center gap-6">
        <p className="eyebrow">Drops in next to the stack you already run</p>
        <div className="marquee w-full">
          <div className="marquee-track">
            {items.map((label, i) => (
              <span
                key={i}
                className="font-mono text-sm text-fg-2 whitespace-nowrap"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
