import { useState, useEffect, useRef } from "react";

// ─── Intersection Observer Hook ────────────────────────────────────────
function useInView(options = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold: 0.15, ...options }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, inView];
}

// ─── Copy Button ────────────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="absolute top-3 right-3 px-2.5 py-1 text-xs rounded bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white transition-all border border-white/5"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ─── Animated Chart SVG ─────────────────────────────────────────────────
function AnimatedChart() {
  return (
    <svg viewBox="0 0 400 120" className="w-full h-auto" preserveAspectRatio="none">
      <defs>
        <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0,100 L30,85 L60,90 L90,60 L120,65 L150,40 L180,50 L210,30 L240,35 L270,20 L300,25 L330,15 L360,18 L400,10"
        fill="none"
        stroke="#ef4444"
        strokeWidth="2"
        className="animate-chart-draw"
      />
      <path
        d="M0,100 L30,85 L60,90 L90,60 L120,65 L150,40 L180,50 L210,30 L240,35 L270,20 L300,25 L330,15 L360,18 L400,10 L400,120 L0,120 Z"
        fill="url(#redGrad)"
        className="animate-fade-in"
      />
    </svg>
  );
}

// ─── Feature Card ───────────────────────────────────────────────────────
function FeatureCard({ icon, title, description, delay = 0 }) {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      style={{ animationDelay: `${delay}ms` }}
      className={`group relative p-6 rounded-xl bg-surface-2/50 border border-border-dim hover:border-red-accent/30 transition-all duration-500 ${inView ? "animate-slide-up" : "opacity-0"}`}
    >
      <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-red-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative z-10">
        <div className="w-10 h-10 rounded-lg bg-red-muted flex items-center justify-center mb-4 text-red-accent">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
        <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ─── Step Card ──────────────────────────────────────────────────────────
function StepCard({ number, title, description, code, delay = 0 }) {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      style={{ animationDelay: `${delay}ms` }}
      className={`relative ${inView ? "animate-slide-up" : "opacity-0"}`}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-accent/20 border border-red-accent/40 flex items-center justify-center text-sm font-bold text-red-accent">
          {number}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-text-primary mb-1">{title}</h3>
          <p className="text-sm text-text-secondary mb-3">{description}</p>
          {code && (
            <div className="relative rounded-lg bg-black border border-border-dim p-4 font-mono text-sm">
              <CopyButton text={code} />
              <code className="text-red-accent">{code}</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stat ───────────────────────────────────────────────────────────────
function Stat({ value, label }) {
  const [ref, inView] = useInView();
  return (
    <div ref={ref} className={`text-center ${inView ? "animate-slide-up" : "opacity-0"}`}>
      <div className="text-3xl sm:text-4xl font-extrabold text-white">{value}</div>
      <div className="text-sm text-text-secondary mt-1">{label}</div>
    </div>
  );
}

// ─── Metric Pill (for demo terminal) ────────────────────────────────────
function Metric({ label, value, color = "text-red-accent" }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border-dim/50 last:border-0">
      <span className="text-text-secondary text-xs">{label}</span>
      <span className={`font-mono text-sm font-medium ${color}`}>{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  APP
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-black text-text-primary font-sans noise-overlay">
      {/* ─── Nav ───────────────────────────────────────────── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-black/80 backdrop-blur-xl border-b border-border-dim"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2.5 group">
            <svg viewBox="0 0 32 32" className="w-7 h-7">
              <rect width="32" height="32" rx="6" fill="#ef4444" />
              <path d="M6 22 L10 12 L14 18 L18 8 L22 16 L26 10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <span className="font-bold text-lg tracking-tight">
              Monitor<span className="text-red-accent">X</span>
            </span>
          </a>
          <div className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#quickstart" className="hover:text-white transition-colors">Quick Start</a>
            <a href="#architecture" className="hover:text-white transition-colors">Architecture</a>
            <a
              href="https://github.com/Abhra0404/Monitoring-tool"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
          </div>
          <a
            href="#quickstart"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-accent hover:bg-red-glow text-white transition-all hover:shadow-lg hover:shadow-red-accent/20"
          >
            Get Started
          </a>
        </div>
      </nav>

      {/* ─── Hero ──────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden grid-bg">
        {/* Radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-red-accent/5 blur-[120px] animate-pulse-glow pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center pt-24 pb-20">
          {/* Badge */}
          <div className="animate-slide-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-red-accent/20 bg-red-muted text-red-accent text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-red-accent animate-pulse" />
            Open Source &amp; Self-Hosted
          </div>

          {/* Headline */}
          <h1 className="animate-slide-up-delay-1 text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.08]">
            Monitor your servers
            <br />
            <span className="bg-gradient-to-r from-red-accent via-red-400 to-orange-400 bg-clip-text text-transparent">
              in one command
            </span>
          </h1>

          <p className="animate-slide-up-delay-2 mt-6 text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed">
            Real-time CPU, memory, disk, and network monitoring with alerts —
            self-hosted, no third-party services, no subscriptions.
          </p>

          {/* CLI Command */}
          <div className="animate-slide-up-delay-3 mt-10 inline-block">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-red-accent/20 via-red-glow/10 to-red-accent/20 rounded-xl blur-lg opacity-50 group-hover:opacity-80 transition-opacity" />
              <div className="relative flex items-center gap-3 px-6 py-4 rounded-xl bg-surface-2 border border-border font-mono text-base sm:text-lg terminal-glow">
                <span className="text-red-accent select-none">$</span>
                <span className="text-text-primary">npx monitorx</span>
                <CopyButton text="npx monitorx" />
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Requires Node.js 18+ and MongoDB
            </p>
          </div>

          {/* Scroll indicator */}
          <div className="mt-16 animate-float">
            <svg className="w-5 h-5 mx-auto text-text-muted" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3v14M4 11l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </section>

      {/* ─── Live Demo Mockup ──────────────────────────────── */}
      <section className="relative py-20 overflow-hidden">
        <div className="max-w-5xl mx-auto px-6">
          <div className="relative rounded-2xl bg-surface-2 border border-border-dim overflow-hidden terminal-glow">
            {/* Terminal header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-surface-3 border-b border-border-dim">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs text-text-muted font-mono ml-2">MonitorX Dashboard — localhost:4000</span>
            </div>
            {/* Dashboard mockup */}
            <div className="p-6">
              {/* Top bar */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm font-medium">prod-server-01</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-green-400/10 text-green-400 border border-green-400/20">ONLINE</span>
                </div>
                <span className="text-xs text-text-muted font-mono">Last update: 2s ago</span>
              </div>
              {/* Metric cards row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                  { label: "CPU", value: "23.4%", bar: 23.4 },
                  { label: "Memory", value: "61.2%", bar: 61.2 },
                  { label: "Disk", value: "45.8%", bar: 45.8 },
                  { label: "Network", value: "2.4 MB/s", bar: 35 },
                ].map((m) => (
                  <div key={m.label} className="p-3 rounded-lg bg-black/40 border border-border-dim">
                    <div className="text-[10px] text-text-muted uppercase tracking-wider">{m.label}</div>
                    <div className="text-xl font-bold mt-1 text-white">{m.value}</div>
                    <div className="mt-2 h-1 rounded-full bg-border-dim overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-accent transition-all duration-1000"
                        style={{ width: `${m.bar}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {/* Chart area */}
              <div className="rounded-lg bg-black/40 border border-border-dim p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-text-muted">CPU Usage — Last 15 min</span>
                  <div className="flex gap-1">
                    {["5m", "15m", "1h", "24h"].map((t) => (
                      <button key={t} className={`px-2 py-0.5 text-[10px] rounded ${t === "15m" ? "bg-red-accent/20 text-red-accent" : "text-text-muted hover:text-text-secondary"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <AnimatedChart />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats ─────────────────────────────────────────── */}
      <section className="py-16 border-y border-border-dim">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          <Stat value="13" label="Metric Types" />
          <Stat value="<5s" label="Update Interval" />
          <Stat value="0" label="External Dependencies" />
          <Stat value="∞" label="Servers Supported" />
        </div>
      </section>

      {/* ─── Features ──────────────────────────────────────── */}
      <section id="features" className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need to{" "}
              <span className="text-red-accent">stay in control</span>
            </h2>
            <p className="mt-4 text-text-secondary max-w-xl mx-auto">
              Production-grade monitoring without the complexity of enterprise tools.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              delay={0}
              icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              title="Real-Time Metrics"
              description="CPU, memory, disk, network, and load averages streamed via WebSocket with sub-second latency."
            />
            <FeatureCard
              delay={100}
              icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
              title="Smart Alerts"
              description="Server-side alert evaluation with duration-based conditions and severity levels (info, warning, critical)."
            />
            <FeatureCard
              delay={200}
              icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>}
              title="Multi-Server"
              description="Monitor unlimited servers from a single dashboard. Each agent reports independently."
            />
            <FeatureCard
              delay={300}
              icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>}
              title="Multi-Tenant Auth"
              description="JWT-based authentication. Each user sees only their own servers. API key auth for agents."
            />
            <FeatureCard
              delay={400}
              icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>}
              title="One Command Setup"
              description="npx monitorx — installs deps, builds the dashboard, starts the server, and opens your browser."
            />
            <FeatureCard
              delay={500}
              icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>}
              title="Docker Ready"
              description="docker compose up — one command spins up MonitorX with MongoDB. Zero configuration needed."
            />
          </div>
        </div>
      </section>

      {/* ─── How It Works / Quick Start ────────────────────── */}
      <section id="quickstart" className="py-24 bg-surface/50 border-y border-border-dim">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Up and running in{" "}
              <span className="text-red-accent">60 seconds</span>
            </h2>
            <p className="mt-4 text-text-secondary">
              No configuration files. No environment setup. Just run.
            </p>
          </div>

          <div className="space-y-10">
            <StepCard
              number="1"
              title="Start MonitorX"
              description="Clone the repo and start the server with a single command."
              code="git clone https://github.com/Abhra0404/Monitoring-tool.git && cd Monitoring-tool && npm start"
              delay={0}
            />
            <div className="ml-4 w-px h-8 bg-gradient-to-b from-red-accent/40 to-transparent" />
            <StepCard
              number="2"
              title="Sign up & get your API key"
              description="Open the dashboard, create an account, and copy your API key from Settings."
              delay={150}
            />
            <div className="ml-4 w-px h-8 bg-gradient-to-b from-red-accent/40 to-transparent" />
            <StepCard
              number="3"
              title="Install the agent on your server"
              description="Run the monitoring agent on any machine you want to track."
              code="cd agent && npm install && API_KEY=your-key API_URL=http://your-host:4000 npm start"
              delay={300}
            />
            <div className="ml-4 w-px h-8 bg-gradient-to-b from-red-accent/40 to-transparent" />
            <StepCard
              number="4"
              title="Watch metrics flow in real-time"
              description="Metrics appear instantly on your dashboard. Set up alerts, monitor multiple servers, all from one place."
              delay={450}
            />
          </div>
        </div>
      </section>

      {/* ─── Architecture ──────────────────────────────────── */}
      <section id="architecture" className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Simple, powerful{" "}
              <span className="text-red-accent">architecture</span>
            </h2>
            <p className="mt-4 text-text-secondary max-w-xl mx-auto">
              A single Node.js process serves the API, dashboard, and WebSocket connections.
            </p>
          </div>

          <div className="relative rounded-2xl bg-surface-2 border border-border-dim p-8 md:p-12 terminal-glow">
            <pre className="font-mono text-xs sm:text-sm text-text-secondary leading-relaxed overflow-x-auto">
{`┌──────────────────────────────────────────────────────────┐
│                     MonitorX Server                       │
│                                                           │
│  ┌─────────────┐  ┌───────────┐  ┌────────────────────┐  │
│  │  React SPA  │  │  REST API │  │  Socket.IO (live)  │  │
│  │  Dashboard  │  │  Express  │  │  metric streaming  │  │
│  └─────────────┘  └───────────┘  └────────────────────┘  │
│                                                           │
│  ┌───────────────────┐  ┌─────────────────────────────┐  │
│  │    Alert Engine    │  │  JWT Auth + API Key Auth    │  │
│  │  server-side eval  │  │  multi-tenant isolation     │  │
│  └───────────────────┘  └─────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│                       MongoDB                             │
│     Users · Servers · Metrics (TimeSeries) · Alerts       │
└──────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    ┌────┴─────┐        ┌────┴─────┐        ┌────┴─────┐
    │ Agent 01 │        │ Agent 02 │        │ Agent N  │
    │  (Node)  │        │  (Node)  │        │  (Node)  │
    └──────────┘        └──────────┘        └──────────┘`}
            </pre>
          </div>
        </div>
      </section>

      {/* ─── Tech Stack ────────────────────────────────────── */}
      <section className="py-24 border-t border-border-dim">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Built with{" "}
              <span className="text-red-accent">modern tools</span>
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: "React 19", desc: "Dashboard UI" },
              { name: "Express 5", desc: "API Server" },
              { name: "Socket.IO", desc: "Real-time" },
              { name: "MongoDB", desc: "TimeSeries DB" },
              { name: "Tailwind CSS", desc: "Styling" },
              { name: "Recharts", desc: "Visualizations" },
              { name: "JWT", desc: "Authentication" },
              { name: "Docker", desc: "Deployment" },
            ].map((tech) => (
              <div
                key={tech.name}
                className="p-4 rounded-lg bg-surface-2/50 border border-border-dim text-center hover:border-red-accent/30 transition-colors"
              >
                <div className="text-sm font-semibold text-white">{tech.name}</div>
                <div className="text-xs text-text-muted mt-1">{tech.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ───────────────────────────────────────────── */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-accent/5 to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Start monitoring{" "}
            <span className="text-red-accent">right now</span>
          </h2>
          <p className="text-text-secondary mb-8">
            No sign-ups, no credit cards, no vendor lock-in. Your servers, your data.
          </p>
          <div className="inline-block">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-red-accent/30 to-red-glow/20 rounded-xl blur-lg opacity-60 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center gap-3 px-8 py-5 rounded-xl bg-surface-2 border border-red-accent/30 font-mono text-lg terminal-glow">
                <span className="text-red-accent">$</span>
                <span>npx monitorx</span>
                <CopyButton text="npx monitorx" />
              </div>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-text-muted">
            <a
              href="https://github.com/Abhra0404/Monitoring-tool"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              View on GitHub
            </a>
            <span className="text-border">·</span>
            <span>MIT License</span>
          </div>
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────────── */}
      <footer className="py-8 border-t border-border-dim">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 32 32" className="w-4 h-4">
              <rect width="32" height="32" rx="6" fill="#ef4444" />
              <path d="M6 22 L10 12 L14 18 L18 8 L22 16 L26 10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <span>MonitorX — Self-hosted system monitoring</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/Abhra0404/Monitoring-tool" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              GitHub
            </a>
            <a href="https://github.com/Abhra0404/Monitoring-tool/issues" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              Issues
            </a>
            <a href="https://github.com/Abhra0404/Monitoring-tool#readme" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
