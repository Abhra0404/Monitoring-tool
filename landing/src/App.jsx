import { useState, useEffect, useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import {
  Activity,
  Server,
  Bell,
  Shield,
  Terminal,
  Cpu,
  HardDrive,
  Wifi,
  BarChart3,
  Clock,
  Copy,
  Check,
  ChevronRight,
  ArrowRight,
  Zap,
  Lock,
  Container,
  Globe,
  ChevronDown,
} from "lucide-react";

function GithubIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   UTILS
   ════════════════════════════════════════════════════════════════════ */

function CopyBtn({ text, className = "" }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handle}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md
        bg-white/5 hover:bg-white/10 text-fg-muted hover:text-fg-secondary
        border border-white/5 transition-all ${className}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Section({ children, className = "", id }) {
  return (
    <section id={id} className={`relative px-4 sm:px-6 lg:px-8 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-muted border border-red-accent/20 text-red-accent text-xs font-medium tracking-wide uppercase mb-4">
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   NAVBAR
   ════════════════════════════════════════════════════════════════════ */

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const links = [
    { href: "#features", label: "Features" },
    { href: "#demo", label: "Preview" },
    { href: "#quickstart", label: "Quick Start" },
    { href: "#architecture", label: "Architecture" },
  ];

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled ? "bg-black/70 backdrop-blur-2xl border-b border-stroke/50" : ""
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5 group">
          <div className="relative w-8 h-8 rounded-lg bg-red-accent flex items-center justify-center">
            <span className="text-white text-lg font-bold leading-none" aria-hidden="true">Θ</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-fg">Theoria</span>
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8 text-sm text-fg-secondary">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-fg transition-colors duration-200">
              {l.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/Abhra0404/Monitoring-tool"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-sm text-fg-secondary hover:text-fg transition-colors"
          >
            <GithubIcon size={16} />
            <span>GitHub</span>
          </a>
          <a
            href="#quickstart"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-accent hover:bg-red-glow text-white transition-all duration-200 hover:shadow-lg hover:shadow-red-accent/25"
          >
            Get Started
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   HERO
   ════════════════════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden hero-gradient">
      {/* Dot grid background */}
      <div className="absolute inset-0 dot-grid opacity-50" />

      {/* Top radial glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-red-accent/8 rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center pt-28 pb-20">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <a
            href="https://github.com/Abhra0404/Monitoring-tool"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-stroke-light bg-surface-raised/80 text-fg-secondary text-sm hover:border-red-accent/30 transition-colors"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-accent/60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-accent" />
            </span>
            Open Source — Star on GitHub
            <ChevronRight size={14} className="text-fg-muted" />
          </a>
        </motion.div>

        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.05]"
        >
          System monitoring
          <br />
          <span className="bg-gradient-to-r from-red-accent via-red-bright to-orange-400 bg-clip-text text-transparent">
            that just works.
          </span>
        </motion.h1>

        {/* Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 text-lg sm:text-xl text-fg-secondary max-w-2xl mx-auto leading-relaxed"
        >
          Real-time CPU, memory, disk & network monitoring with smart alerts.
          <br className="hidden sm:block" />
          Self-hosted. One command. Zero configuration.
        </motion.p>

        {/* CLI Command */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-10"
        >
          <div className="inline-flex flex-col items-center">
            <div className="relative group">
              <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-red-accent/40 via-red-glow/20 to-red-accent/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
              <div className="relative flex items-center gap-3 px-6 sm:px-8 py-4 rounded-2xl bg-surface-card border border-stroke-light font-mono text-base sm:text-lg glow-red">
                <span className="text-red-accent font-bold">$</span>
                <span className="text-fg">npx theoria-cli</span>
                <CopyBtn text="npx theoria-cli" className="ml-2" />
              </div>
            </div>
            <p className="mt-4 text-xs text-fg-muted flex items-center gap-1.5">
              <Zap size={12} className="text-red-accent" />
              Installs deps, builds dashboard, opens browser — all automatic
            </p>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="mt-20"
        >
          <a href="#demo" className="inline-flex flex-col items-center gap-2 text-fg-muted hover:text-fg-secondary transition-colors">
            <span className="text-xs">See it in action</span>
            <ChevronDown size={16} className="animate-bounce" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   METRICS TICKER
   ════════════════════════════════════════════════════════════════════ */

function MetricsTicker() {
  const items = [
    "CPU Usage", "Memory", "Disk I/O", "Network RX/TX", "Load Average",
    "System Uptime", "Process Count", "Disk Space", "Swap Usage",
    "CPU Temperature", "Bandwidth", "Latency", "Error Rate",
  ];
  const doubled = [...items, ...items];

  return (
    <div className="py-8 border-y border-stroke overflow-hidden metrics-scroll">
      <div className="flex gap-8 scroll-animate" style={{ width: "max-content" }}>
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-fg-muted whitespace-nowrap">
            <Activity size={12} className="text-red-accent/60" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   DASHBOARD PREVIEW
   ════════════════════════════════════════════════════════════════════ */

function DashboardPreview() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const metrics = [
    { label: "CPU", value: "23.4%", percentage: 23.4, icon: Cpu },
    { label: "Memory", value: "6.1 / 16 GB", percentage: 38.2, icon: HardDrive },
    { label: "Disk", value: "142 / 512 GB", percentage: 27.7, icon: HardDrive },
    { label: "Network", value: "2.4 MB/s", percentage: 12, icon: Wifi },
  ];

  return (
    <Section id="demo" className="py-24">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 60 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="text-center mb-12">
          <SectionLabel>Live Preview</SectionLabel>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-fg">
            Your servers, at a glance
          </h2>
          <p className="mt-3 text-fg-secondary max-w-lg mx-auto">
            A real-time dashboard that shows what matters — no noise, no clutter.
          </p>
        </div>

        {/* Terminal frame */}
        <div className="relative rounded-2xl overflow-hidden glow-red-strong border border-stroke">
          {/* Title bar */}
          <div className="flex items-center gap-3 px-5 py-3.5 bg-surface-raised border-b border-stroke">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex-1 text-center">
              <span className="text-xs text-fg-muted font-mono">Theoria — localhost:4000</span>
            </div>
            <div className="w-[52px]" />
          </div>

          {/* Dashboard content */}
          <div className="bg-surface p-4 sm:p-6">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="relative w-2.5 h-2.5">
                  <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-40" />
                  <span className="relative block w-2.5 h-2.5 rounded-full bg-green-400" />
                </div>
                <span className="text-sm font-semibold text-fg">prod-server-01</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 uppercase tracking-wider">
                  Online
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5">
                {["5m", "15m", "1h", "6h", "24h"].map((t, i) => (
                  <button
                    key={t}
                    className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${
                      i === 2
                        ? "bg-red-accent/15 text-red-accent border border-red-accent/25"
                        : "text-fg-muted hover:text-fg-secondary"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {metrics.map((m, i) => (
                <motion.div
                  key={m.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
                  className="p-4 rounded-xl bg-surface-raised border border-stroke"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">{m.label}</span>
                    <m.icon size={14} className="text-fg-dim" />
                  </div>
                  <div className="text-2xl font-bold text-fg">{m.value}</div>
                  <div className="mt-3 h-1.5 rounded-full bg-stroke/50 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-red-accent to-red-bright"
                      initial={{ width: 0 }}
                      animate={isInView ? { width: `${m.percentage}%` } : {}}
                      transition={{ delay: 0.5 + i * 0.1, duration: 1, ease: "easeOut" }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Chart area */}
            <div className="rounded-xl bg-surface-raised border border-stroke p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-semibold text-fg">CPU Usage</div>
                  <div className="text-xs text-fg-muted mt-0.5">Last 60 minutes</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-fg">23.4%</div>
                  <div className="text-xs text-green-400">↓ 2.1% from avg</div>
                </div>
              </div>
              <svg viewBox="0 0 600 150" className="w-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Grid lines */}
                {[30, 60, 90, 120].map((y) => (
                  <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#1a1a1a" strokeWidth="1" />
                ))}
                {/* Area fill */}
                <path
                  d="M0,130 C30,125 60,120 90,100 C120,80 150,85 180,70 C210,55 240,60 270,45 C300,30 330,50 360,40 C390,30 420,35 450,55 C480,75 510,65 540,50 C570,35 600,45 600,45 L600,150 L0,150 Z"
                  fill="url(#chartFill)"
                />
                {/* Line */}
                <path
                  d="M0,130 C30,125 60,120 90,100 C120,80 150,85 180,70 C210,55 240,60 270,45 C300,30 330,50 360,40 C390,30 420,35 450,55 C480,75 510,65 540,50 C570,35 600,45 600,45"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="chart-line"
                />
                {/* Current point */}
                <circle cx="600" cy="45" r="4" fill="#ef4444" />
                <circle cx="600" cy="45" r="8" fill="#ef4444" fillOpacity="0.2" />
              </svg>
            </div>
          </div>
        </div>
      </motion.div>
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FEATURES
   ════════════════════════════════════════════════════════════════════ */

const FEATURES = [
  {
    icon: Activity,
    title: "Real-Time Streaming",
    description: "WebSocket-powered metrics with sub-second latency. CPU, memory, disk, network, load averages — updated every 5 seconds.",
  },
  {
    icon: Bell,
    title: "Smart Alert Engine",
    description: "Server-side evaluation with duration-based conditions. Severity levels from info to critical. Full alert history timeline.",
  },
  {
    icon: Server,
    title: "Multi-Server",
    description: "Monitor unlimited servers from one dashboard. Each agent reports independently with automatic discovery.",
  },
  {
    icon: Lock,
    title: "Multi-Tenant Auth",
    description: "JWT authentication with user isolation. API key auth for agents. Each user sees only their own infrastructure.",
  },
  {
    icon: Terminal,
    title: "One Command Setup",
    description: "npx theoria-cli — starts the server, opens the dashboard, and walks you through setup on first run.",
  },
  {
    icon: Container,
    title: "Docker Native",
    description: "docker compose up — full stack with MongoDB in one command. Multi-stage build keeps the image under 200MB.",
  },
  {
    icon: BarChart3,
    title: "13 Metric Types",
    description: "CPU per-core, memory breakdown, disk I/O, network interfaces, load averages, uptime, swap. All stored in MongoDB TimeSeries.",
  },
  {
    icon: Clock,
    title: "Time Range Analysis",
    description: "Zoom from 5 minutes to 7 days. Smart downsampling for longer ranges keeps the UI responsive with large datasets.",
  },
  {
    icon: Globe,
    title: "Fully Self-Hosted",
    description: "Your servers, your data. No third-party services, no subscriptions, no vendor lock-in. Runs anywhere Node.js runs.",
  },
];

function Features() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <Section id="features" className="py-24">
      <div ref={ref}>
        <div className="text-center mb-16">
          <SectionLabel>Capabilities</SectionLabel>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-fg">
            Everything you need.{" "}
            <span className="text-fg-secondary">Nothing you don't.</span>
          </h2>
          <p className="mt-4 text-fg-secondary max-w-xl mx-auto">
            Production-grade monitoring without the complexity of enterprise tools.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="feature-card rounded-xl p-6 group"
            >
              <div className="w-10 h-10 rounded-lg bg-red-muted flex items-center justify-center mb-4 group-hover:bg-red-accent/20 transition-colors duration-300">
                <f.icon size={20} className="text-red-accent" />
              </div>
              <h3 className="text-base font-semibold text-fg mb-2">{f.title}</h3>
              <p className="text-sm text-fg-secondary leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   QUICK START
   ════════════════════════════════════════════════════════════════════ */

function QuickStart() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const steps = [
    {
      num: "01",
      title: "Start Theoria",
      desc: "Clone and run — setup is fully interactive on first launch.",
      code: "git clone https://github.com/Abhra0404/Monitoring-tool.git\ncd Monitoring-tool\nnpm start",
    },
    {
      num: "02",
      title: "Create your account",
      desc: "Open the dashboard, sign up, and grab your API key from Settings.",
      code: null,
    },
    {
      num: "03",
      title: "Deploy an agent",
      desc: "Install the agent on any server you want to monitor.",
      code: "cd agent && npm install\nAPI_KEY=your-key API_URL=http://host:4000 npm start",
    },
    {
      num: "04",
      title: "Watch metrics flow",
      desc: "Real-time data appears instantly. Set up alerts, add more servers.",
      code: null,
    },
  ];

  return (
    <Section id="quickstart" className="py-24 border-t border-stroke">
      <div ref={ref}>
        <div className="text-center mb-16">
          <SectionLabel>Quick Start</SectionLabel>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-fg">
            Running in{" "}
            <span className="bg-gradient-to-r from-red-accent to-red-bright bg-clip-text text-transparent">
              under a minute
            </span>
          </h2>
          <p className="mt-4 text-fg-secondary">
            No configuration files. No environment setup. Just run.
          </p>
        </div>

        <div className="max-w-2xl mx-auto space-y-1">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, x: -30 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex gap-5 py-6">
                {/* Step number */}
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full border border-red-accent/30 bg-red-muted flex items-center justify-center text-sm font-bold text-red-accent shrink-0">
                    {step.num}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px flex-1 mt-3 bg-gradient-to-b from-red-accent/30 to-transparent" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-2">
                  <h3 className="text-lg font-semibold text-fg">{step.title}</h3>
                  <p className="text-sm text-fg-secondary mt-1 mb-3">{step.desc}</p>
                  {step.code && (
                    <div className="relative rounded-lg code-block overflow-hidden">
                      <div className="absolute top-2 right-2 z-10">
                        <CopyBtn text={step.code} />
                      </div>
                      <pre className="p-4 pr-20 text-sm font-mono text-fg-secondary overflow-x-auto">
                        <code>
                          {step.code.split("\n").map((line, j) => (
                            <span key={j} className="block">
                              <span className="text-red-accent/60 select-none">$ </span>
                              <span className="text-fg">{line}</span>
                            </span>
                          ))}
                        </code>
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ARCHITECTURE
   ════════════════════════════════════════════════════════════════════ */

function Architecture() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <Section id="architecture" className="py-24 border-t border-stroke">
      <div ref={ref}>
        <div className="text-center mb-16">
          <SectionLabel>Architecture</SectionLabel>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-fg">
            Simple by design
          </h2>
          <p className="mt-4 text-fg-secondary max-w-lg mx-auto">
            One server process. One port. Everything included.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-3xl mx-auto"
        >
          {/* Server block */}
          <div className="rounded-2xl border border-stroke bg-surface-card p-6 sm:p-8 glow-red">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 text-lg font-bold text-fg">
                <div className="w-8 h-8 rounded-lg bg-red-accent flex items-center justify-center">
                  <Activity size={16} className="text-white" strokeWidth={2.5} />
                </div>
                Theoria Server
              </div>
              <div className="text-xs text-fg-muted mt-1">Single process, single port</div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 mb-6">
              {[
                { icon: Globe, label: "React Dashboard", sub: "Static SPA" },
                { icon: Zap, label: "REST API", sub: "Express 5" },
                { icon: Wifi, label: "WebSocket", sub: "Socket.IO" },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-lg bg-surface-raised border border-stroke text-center">
                  <item.icon size={18} className="text-red-accent mx-auto mb-1.5" />
                  <div className="text-xs font-semibold text-fg">{item.label}</div>
                  <div className="text-[10px] text-fg-muted">{item.sub}</div>
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { icon: Bell, label: "Alert Engine", sub: "Server-side evaluation" },
                { icon: Shield, label: "Auth Layer", sub: "JWT + API Keys" },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-lg bg-surface-raised border border-stroke text-center">
                  <item.icon size={18} className="text-red-accent mx-auto mb-1.5" />
                  <div className="text-xs font-semibold text-fg">{item.label}</div>
                  <div className="text-[10px] text-fg-muted">{item.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Connection lines */}
          <div className="flex justify-center py-4">
            <div className="flex items-center gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-px h-8 bg-gradient-to-b from-red-accent/40 to-red-accent/10" />
                  <div className="w-2 h-2 rounded-full bg-red-accent/40" />
                </div>
              ))}
            </div>
          </div>

          {/* Agents */}
          <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
            {["Agent 01", "Agent 02", "Agent N"].map((name) => (
              <div key={name} className="p-3 rounded-xl border border-stroke bg-surface-card text-center">
                <Server size={16} className="text-fg-muted mx-auto mb-1.5" />
                <div className="text-xs font-medium text-fg-secondary">{name}</div>
                <div className="text-[10px] text-fg-muted">Node.js</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TECH STACK
   ════════════════════════════════════════════════════════════════════ */

function TechStack() {
  const techs = [
    { name: "React 19", cat: "Frontend" },
    { name: "Express 5", cat: "Backend" },
    { name: "Socket.IO", cat: "Real-time" },
    { name: "MongoDB", cat: "Database" },
    { name: "Tailwind CSS", cat: "Styling" },
    { name: "Recharts", cat: "Charts" },
    { name: "JWT", cat: "Auth" },
    { name: "Docker", cat: "Deploy" },
  ];

  return (
    <Section className="py-20 border-t border-stroke">
      <div className="text-center mb-10">
        <h3 className="text-xl font-bold text-fg">Built with modern tools</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
        {techs.map((t) => (
          <div
            key={t.name}
            className="p-4 rounded-xl bg-surface-card border border-stroke text-center hover:border-stroke-light transition-colors"
          >
            <div className="text-sm font-semibold text-fg">{t.name}</div>
            <div className="text-[11px] text-fg-muted mt-0.5">{t.cat}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   CTA
   ════════════════════════════════════════════════════════════════════ */

function CTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <Section className="py-32 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 hero-gradient pointer-events-none" />
      <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />

      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 40 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7 }}
        className="relative z-10 text-center"
      >
        <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-fg">
          Start monitoring
          <br />
          <span className="bg-gradient-to-r from-red-accent to-red-bright bg-clip-text text-transparent">
            in 30 seconds.
          </span>
        </h2>

        <p className="mt-5 text-fg-secondary text-lg max-w-md mx-auto">
          No sign-ups. No credit cards. No vendor lock-in.
          <br />Your servers, your data.
        </p>

        <div className="mt-10 inline-flex flex-col items-center">
          <div className="relative group">
            <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-red-accent/50 via-red-glow/30 to-red-accent/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur" />
            <div className="relative flex items-center gap-4 px-8 py-5 rounded-2xl bg-surface-card border border-stroke-light font-mono text-lg glow-red-strong">
              <span className="text-red-accent font-bold">$</span>
              <span className="text-fg">npx theoria-cli</span>
              <CopyBtn text="npx theoria-cli" />
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm">
            <a
              href="https://github.com/Abhra0404/Monitoring-tool"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/5 border border-stroke-light text-fg-secondary hover:text-fg hover:border-stroke-light hover:bg-white/10 transition-all"
            >
              <GithubIcon size={16} />
              Star on GitHub
            </a>
            <a
              href="https://github.com/Abhra0404/Monitoring-tool#docker"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-fg-secondary hover:text-fg transition-colors"
            >
              <Container size={16} />
              Docker Guide
              <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </motion.div>
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   FOOTER
   ════════════════════════════════════════════════════════════════════ */

function Footer() {
  return (
    <footer className="border-t border-stroke py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-red-accent flex items-center justify-center">
            <Activity size={12} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-sm text-fg-muted">
            Theoria — Open-source system monitoring
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-fg-muted">
          <a href="https://github.com/Abhra0404/Monitoring-tool" target="_blank" rel="noopener noreferrer" className="hover:text-fg transition-colors">
            GitHub
          </a>
          <a href="https://github.com/Abhra0404/Monitoring-tool/issues" target="_blank" rel="noopener noreferrer" className="hover:text-fg transition-colors">
            Issues
          </a>
          <a href="https://github.com/Abhra0404/Monitoring-tool#readme" target="_blank" rel="noopener noreferrer" className="hover:text-fg transition-colors">
            Documentation
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   APP
   ════════════════════════════════════════════════════════════════════ */

export default function App() {
  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <Hero />
      <MetricsTicker />
      <DashboardPreview />
      <Features />
      <QuickStart />
      <Architecture />
      <TechStack />
      <CTA />
      <Footer />
    </div>
  );
}
