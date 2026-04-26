import { Check, Minus, X } from "lucide-react";
import { Section, SectionHead } from "../lib/ui.jsx";

/**
 * Faithful to plans/competitive-comparison.md.
 * Tone marks: yes / partial / no.
 */
const ROWS = [
  { label: "Server metrics (CPU/mem/disk/net)", theoria: "yes", kuma: "no", beszel: "yes", netdata: "yes" },
  { label: "Synthetic checks (HTTP / TCP / DNS / Ping / Heartbeat)", theoria: "yes", kuma: "yes", beszel: "no", netdata: "partial" },
  { label: "Alert engine with duration + label match", theoria: "yes", kuma: "partial", beszel: "partial", netdata: "yes" },
  { label: "Built-in anomaly detection", theoria: "yes", kuma: "no", beszel: "no", netdata: "yes" },
  { label: "Public status page with custom domain + TLS", theoria: "yes", kuma: "yes", beszel: "no", netdata: "no" },
  { label: "First-class incidents & pipelines", theoria: "yes", kuma: "no", beszel: "no", netdata: "no" },
  { label: "Topology graph", theoria: "yes", kuma: "no", beszel: "no", netdata: "yes" },
  { label: "Multi-replica HA (Redis + Timescale)", theoria: "yes", kuma: "no", beszel: "no", netdata: "partial" },
  { label: "OTLP ingest + Prometheus /metrics", theoria: "yes", kuma: "partial", beszel: "partial", netdata: "partial" },
  { label: "Self-hosted, single binary install", theoria: "yes", kuma: "yes", beszel: "yes", netdata: "yes" },
  { label: "Apache 2.0 license", theoria: "yes", kuma: "MIT", beszel: "MIT", netdata: "GPL-3+" },
];

function Cell({ value }) {
  if (value === "yes") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-brand-line bg-brand-soft">
        <Check size={13} className="text-brand-bright" />
      </span>
    );
  }
  if (value === "partial") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-warn/30 bg-warn/10">
        <Minus size={13} className="text-warn" />
      </span>
    );
  }
  if (value === "no") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-stroke-1 bg-surface-2">
        <X size={13} className="text-fg-3" />
      </span>
    );
  }
  return <span className="font-mono text-[11px] text-fg-2">{value}</span>;
}

export default function Compare() {
  return (
    <Section id="compare" className="py-24 sm:py-32 border-t border-stroke">
      <SectionHead
        eyebrow="How it stacks up"
        title="Theoria replaces three tools you'd otherwise stitch together."
        kicker="Uptime Kuma owns synthetics. Beszel owns server metrics. Netdata owns collector breadth. Theoria is the integrated answer for teams that want one console, one alert pipeline and one status page."
      />

      <div className="mt-14 overflow-hidden rounded-2xl border border-stroke bg-surface">
        <div className="overflow-x-auto">
          <table className="cmp min-w-[680px]">
            <thead>
              <tr>
                <th className="w-1/2 pl-5">Capability</th>
                <th className="text-center col-head-theoria">Theoria</th>
                <th className="text-center">Uptime Kuma</th>
                <th className="text-center">Beszel</th>
                <th className="text-center pr-5">Netdata</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label}>
                  <td className="pl-5 text-fg-1">{r.label}</td>
                  <td className="text-center col-theoria">
                    <Cell value={r.theoria} />
                  </td>
                  <td className="text-center">
                    <Cell value={r.kuma} />
                  </td>
                  <td className="text-center">
                    <Cell value={r.beszel} />
                  </td>
                  <td className="text-center pr-5">
                    <Cell value={r.netdata} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-fg-2">
        Sources: each tool's latest README, audited 23 April 2026 
      </p>
    </Section>
  );
}
