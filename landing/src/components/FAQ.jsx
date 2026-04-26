import { ChevronDown } from "lucide-react";
import { Section, SectionHead } from "../lib/ui.jsx";

const QA = [
  {
    q: "Is Theoria really self-hosted?",
    a: "Yes. There is no Theoria-operated control plane, no telemetry beacon and no signup. The server runs entirely on your infrastructure. The only optional outbound calls are the notification channels you configure and an opt-in Sentry DSN.",
  },
  {
    q: "How does Theoria scale?",
    a: "Out of the box, a single process handles thousands of agents and checks. For HA, point Theoria at PostgreSQL + TimescaleDB and Redis — every replica then shares Socket.IO pub/sub, alert breach state and rate-limit counters, so you can run N replicas behind a load balancer.",
  },
  {
    q: "What's the difference between Theoria and Uptime Kuma or Beszel?",
    a: "Uptime Kuma does synthetic checks and status pages, no server metrics. Beszel does server metrics, no synthetics. Theoria does both — plus alerting, incidents, anomaly detection, OTLP ingest, plugins and a public status page in one binary. See the comparison section above.",
  },
  {
    q: "Do I need Postgres or Redis?",
    a: "No. The default install runs in-memory and persists a JSON snapshot to ~/.theoria. Postgres unlocks long-term retention and survives restarts; Redis unlocks horizontal scale. Add either independently when you need it.",
  },
  {
    q: "Can I use my existing OpenTelemetry collector?",
    a: "Yes. Theoria exposes an OTLP/HTTP endpoint at /v1/metrics. Point any OTel collector at it and the metrics flow into the same store as agent-pushed data, with the same alerting and dashboards on top.",
  },
  {
    q: "What does the agent install on my servers?",
    a: "A single 10MB Go binary plus a systemd unit (or launchd plist on macOS, scheduled task on Windows). It collects CPU, memory, disk, network, load and Docker container stats every five seconds and POSTs them over HTTPS with a per-agent API key.",
  },
  {
    q: "What's the license?",
    a: "Apache 2.0 for the server, the agent, the React dashboard, the Helm chart and the official plugins. No commercial restrictions, no contributor licence agreement.",
  },
  {
    q: "Is there a paid hosted version?",
    a: "Not today. Theoria's commercial focus is on building the best self-hosted experience first; a managed offering may follow but won't gate features in the OSS edition.",
  },
];

export default function FAQ() {
  return (
    <Section id="faq" className="py-24 sm:py-32 border-t border-stroke">
      <SectionHead
        align="center"
        eyebrow="FAQ"
        title="Questions, answered."
        kicker="If you're still unsure after this, open an issue on GitHub — we read every one."
      />

      <div className="mx-auto mt-12 max-w-3xl divide-y divide-stroke rounded-2xl border border-stroke bg-surface">
        {QA.map((item) => (
          <details key={item.q} className="faq group px-5 py-4">
            <summary className="flex items-center justify-between gap-4">
              <span className="text-[15px] font-semibold text-fg">{item.q}</span>
              <ChevronDown size={16} className="faq-chev shrink-0 text-fg-2" />
            </summary>
            <p className="mt-3 text-[14px] leading-relaxed text-fg-1">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
