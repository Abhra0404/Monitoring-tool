import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, ChevronRight, Container, Package, Server, Terminal } from "lucide-react";
import { CopyButton, Section, SectionHead } from "../lib/ui.jsx";

const TABS = [
  {
    id: "npx",
    label: "npx",
    icon: Terminal,
    blurb: "Zero-install. Spawns the server, opens the dashboard, generates an admin password.",
    code: `# Run the latest CLI; data persists to ~/.theoria/
npx theoria-cli@latest

# Open http://localhost:4000 — credentials are printed
# to ~/.theoria/admin-credentials.txt on first run.`,
  },
  {
    id: "docker",
    label: "Docker",
    icon: Container,
    blurb: "Single container, optional Postgres + Redis sidecars for production.",
    code: `# Quickstart — in-memory store, JSON snapshot
docker run -d --name theoria \\
  -p 4000:4000 \\
  -v theoria-data:/data \\
  -e JWT_SECRET="$(openssl rand -hex 32)" \\
  ghcr.io/abhra0404/theoria:latest

# Production — with docker compose
curl -O https://raw.githubusercontent.com/Abhra0404/Monitoring-tool/main/docker-compose.yml
docker compose up -d`,
  },
  {
    id: "helm",
    label: "Helm",
    icon: Package,
    blurb: "Production Kubernetes deploy with bundled Postgres + Redis.",
    code: `helm repo add theoria https://charts.theoria.dev
helm repo update

helm install theoria theoria/theoria \\
  --namespace monitoring --create-namespace \\
  --set postgres.enabled=true \\
  --set redis.enabled=true \\
  --set ingress.host=monitor.acme.com`,
  },
  {
    id: "agent",
    label: "Agent",
    icon: Server,
    blurb: "10MB Go agent for Linux, macOS or Windows. systemd unit included.",
    code: `# One-line install (Linux + macOS)
curl -fsSL https://get.theoria.dev/agent | sh -s -- \\
  --url https://monitor.acme.com \\
  --key tk_live_xxxxxxxx

# Confirm: agent registers and metrics start within 10s
systemctl status theoria-agent`,
  },
];

const STEPS = [
  {
    title: "Boot the server",
    body: "One process serves the API, the React dashboard and the WebSocket bus on port 4000.",
  },
  {
    title: "Generate an API key",
    body: "Sign in with the auto-generated admin credentials, then mint a per-server agent key.",
  },
  {
    title: "Deploy agents",
    body: "Curl-installed Go binary or sidecar container. Metrics begin in seconds.",
  },
  {
    title: "Add checks & alerts",
    body: "Synthetic checks, threshold rules and notification channels — all from the UI or REST API.",
  },
];

function Tab({ tab, active, onClick }) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "text-fg" : "text-fg-2 hover:text-fg-1"
      }`}
    >
      <Icon size={14} />
      {tab.label}
      {active && (
        <motion.span
          layoutId="install-tab"
          className="absolute inset-0 -z-10 rounded-md border border-stroke-1 bg-surface-2"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
    </button>
  );
}

export default function QuickStart() {
  const [active, setActive] = useState(TABS[0].id);
  const tab = TABS.find((t) => t.id === active);

  return (
    <Section id="install" className="py-24 sm:py-32 border-t border-stroke">
      <SectionHead
        eyebrow="Install"
        title="Production-ready in under a minute."
        kicker="Theoria ships as a single npm package, an OCI image and a Helm chart. Pick the path that fits your platform — they all converge on the same dashboard."
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr,420px] lg:items-start">
        {/* Code panel */}
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stroke px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-1">
              {TABS.map((t) => (
                <Tab key={t.id} tab={t} active={active === t.id} onClick={() => setActive(t.id)} />
              ))}
            </div>
            <CopyButton text={tab.code} />
          </div>
          <div className="px-5 pb-5 pt-4">
            <p className="text-sm text-fg-1">{tab.blurb}</p>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-bg/80 p-4 font-mono text-[12.5px] leading-relaxed text-fg-1">
              <code>
                {tab.code.split("\n").map((line, i) => (
                  <span key={i} className="block">
                    {line.startsWith("#") ? (
                      <span className="text-fg-3">{line}</span>
                    ) : line.trim() === "" ? (
                      "\u00a0"
                    ) : (
                      <>
                        <span className="select-none text-brand">$ </span>
                        <span className="text-fg">{line}</span>
                      </>
                    )}
                  </span>
                ))}
              </code>
            </pre>
            <a
              href="https://github.com/Abhra0404/Monitoring-tool#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-xs text-fg-2 hover:text-fg"
            >
              Full installation guide <ChevronRight size={12} />
            </a>
          </div>
        </div>

        {/* Steps */}
        <ol className="relative space-y-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative pl-12">
              <span className="absolute left-0 top-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-line bg-brand-soft font-mono text-xs font-medium text-brand-bright">
                0{i + 1}
              </span>
              {i < STEPS.length - 1 && (
                <span className="absolute left-[18px] top-9 h-[calc(100%+0.6rem)] w-px bg-gradient-to-b from-stroke-1 to-transparent" />
              )}
              <h3 className="text-[15px] font-semibold text-fg">{s.title}</h3>
              <p className="mt-1 text-sm text-fg-1">{s.body}</p>
            </li>
          ))}

          <li className="rounded-xl border border-stroke bg-surface-1 p-4">
            <div className="flex items-center gap-2">
              <Check size={14} className="text-brand" />
              <span className="text-sm font-semibold text-fg">No vendor lock-in</span>
            </div>
            <p className="mt-1 text-[13px] text-fg-1">
              Your data stays on your infrastructure. Export to OTLP, Prometheus
              remote-write, JSON or Postgres at any time.
            </p>
            <a
              href="https://github.com/Abhra0404/Monitoring-tool/blob/main/docs/runbook.md"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-fg-1 hover:text-fg"
            >
              Read the runbook <ArrowRight size={12} />
            </a>
          </li>
        </ol>
      </div>
    </Section>
  );
}
