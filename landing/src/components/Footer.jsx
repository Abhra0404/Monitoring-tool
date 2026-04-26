import { FaLinkedinIn } from "react-icons/fa6";
import { SiDiscord, SiGithub, SiX } from "react-icons/si";
import { Section, ThetaMark } from "../lib/ui.jsx";

function SnakeWatermark({ text }) {
  return (
    <div className="relative select-none" aria-hidden="true">
      <svg
        className="w-full"
        viewBox="0 0 900 130"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id="snake-grad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="rgba(255,255,255,0.06)">
              <animate attributeName="offset" values="-0.05;0.85" dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="0.1" stopColor="rgba(255,255,255,0.35)">
              <animate attributeName="offset" values="0.05;0.95" dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="0.2" stopColor="rgba(255,255,255,0.06)">
              <animate attributeName="offset" values="0.15;1.05" dur="3s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        </defs>

        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fill="url(#snake-grad)"
          fontFamily="Inter, system-ui, -apple-system, sans-serif"
          fontSize="120"
          fontWeight="700"
          letterSpacing="-5"
        >
          {text}
        </text>
      </svg>
    </div>
  );
}

export default function Footer() {
  const COLUMNS = [
    {
      title: "Product",
      links: [
        { label: "Features", href: "#features" },
        { label: "Compare", href: "#compare" },
        { label: "Architecture", href: "#architecture" },
        { label: "Roadmap", href: "https://github.com/Abhra0404/Monitoring-tool/blob/main/plans/v2-implementation-plan.md" },
      ],
    },
    {
      title: "Install",
      links: [
        { label: "npx", href: "#install" },
        { label: "Docker", href: "#install" },
        { label: "Helm", href: "#install" },
        { label: "Agent", href: "#install" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Documentation", href: "https://github.com/Abhra0404/Monitoring-tool#readme" },
        { label: "Runbook", href: "https://github.com/Abhra0404/Monitoring-tool/blob/main/docs/runbook.md" },
        { label: "Plugin authoring", href: "https://github.com/Abhra0404/Monitoring-tool/blob/main/docs/plugin-authoring.md" },
        { label: "Architecture", href: "https://github.com/Abhra0404/Monitoring-tool/blob/main/docs/architecture.md" },
      ],
    },
  ];

  return (
    <footer id="docs" className="overflow-hidden rounded-t-[2.5rem] border-t border-stroke bg-surface/40 sm:rounded-t-[3.5rem] lg:rounded-t-[5rem]">
      <Section className="pt-16 pb-0">
        {/* Top: brand + columns */}
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 sm:gap-6">
          <div className="col-span-2 sm:col-span-1 sm:pr-12 lg:pr-20">
            <a href="#" className="inline-flex items-center gap-2.5">
              <ThetaMark size={26} />
              <span className="text-lg font-semibold tracking-tight text-fg">Theoria</span>
            </a>
            <p className="mt-5 max-w-xs text-[14px] leading-relaxed text-fg-2">
              Self-hosted, open-source monitoring for servers, services and
              status.
            </p>
            <div className="mt-6 flex items-center gap-4 text-fg-2">
              <a
                href="https://github.com/Abhra0404/Monitoring-tool"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="transition-colors hover:text-fg"
              >
                <SiGithub size={18} />
              </a>
              <a
                href="https://x.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X"
                className="transition-colors hover:text-fg"
              >
                <SiX size={16} />
              </a>
              <a
                href="https://www.linkedin.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="transition-colors hover:text-fg"
              >
                <FaLinkedinIn size={18} />
              </a>
              <a
                href="https://discord.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                className="transition-colors hover:text-fg"
              >
                <SiDiscord size={18} />
              </a>
            </div>
          </div>

          {COLUMNS.map((c) => (
            <div key={c.title}>
              <h4 className="text-[15px] font-semibold text-fg">{c.title}</h4>
              <ul className="mt-5 space-y-3.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target={l.href.startsWith("http") ? "_blank" : undefined}
                      rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="text-[14px] text-fg-2 transition-colors hover:text-fg"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mt-10 border-t border-stroke" />

        {/* Wordmark */}
        <div className="relative -mx-5 sm:-mx-6 lg:-mx-8 mt-2 overflow-hidden">
          <SnakeWatermark text="Theoria" />
        </div>

        {/* Centered copyright */}
        <div className="pb-8 text-center text-xs text-fg-2">
          © {new Date().getFullYear()} Theoria. Apache License 2.0.
        </div>
      </Section>
    </footer>
  );
}
