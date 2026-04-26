import { useEffect, useMemo, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { GitHubIcon, ThetaMark } from "../lib/ui.jsx";

/* ─────────────────────────────────────────────────────────
   1.  MDX-style typography primitives
   ───────────────────────────────────────────────────────── */

function H1({ children }) {
  return <h1>{children}</h1>;
}
function H2({ id, children }) {
  return <h2 id={id}>{children}</h2>;
}
function H3({ id, children }) {
  return <h3 id={id}>{children}</h3>;
}
function P({ children }) {
  return <p>{children}</p>;
}
function UL({ children }) {
  return <ul>{children}</ul>;
}
function OL({ children }) {
  return <ol>{children}</ol>;
}
function LI({ children }) {
  return <li>{children}</li>;
}
function C({ children }) {
  return <code>{children}</code>;
}

function Pre({ lang = "bash", children }) {
  const text = typeof children === "string" ? children : String(children);
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="code-shell my-5">
      <div className="terminal-chrome">
        <span style={{ background: "#ff5f57" }} />
        <span style={{ background: "#febc2e" }} />
        <span style={{ background: "#28c840" }} />
        <span className="ml-2 font-mono text-[11px] text-fg-3">{lang}</span>
        <button
          type="button"
          onClick={onCopy}
          className="ml-auto rounded-md border border-stroke-1 bg-surface-2/60 px-2 py-0.5 font-mono text-[10px] text-fg-2 transition-colors hover:text-fg"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-6 text-fg-1">
        {text}
      </pre>
    </div>
  );
}

function Note({ tone = "info", title, children }) {
  const palette =
    tone === "warn"
      ? "border-warn/30 bg-warn/10 text-warn"
      : tone === "alert"
      ? "border-alert/30 bg-alert-soft text-alert"
      : "border-brand-line bg-brand-soft text-brand-bright";
  return (
    <aside className={`my-5 rounded-xl border p-4 ${palette}`}>
      {title && (
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.16em]">
          {title}
        </div>
      )}
      <div className="text-[14px] leading-relaxed text-fg-1">{children}</div>
    </aside>
  );
}

function Tbl({ head, rows }) {
  return (
    <div className="my-5 overflow-x-auto rounded-xl border border-stroke">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-stroke bg-surface-1 px-4 py-2.5 text-left text-[12px] font-medium uppercase tracking-wider text-fg-2"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-stroke px-4 py-2.5 text-[13.5px] text-fg-1 last:border-r-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   2.  Sidebar / navigation tree
   ───────────────────────────────────────────────────────── */

const NAV = [
  {
    section: "Getting started",
    items: [
      { slug: "introduction", label: "Introduction" },
      { slug: "installation", label: "Installation" },
      { slug: "quickstart", label: "Quickstart" },
      { slug: "configuration", label: "Configuration" },
    ],
  },
  {
    section: "Architecture",
    items: [
      { slug: "architecture/overview", label: "Overview" },
      { slug: "architecture/components", label: "Components" },
      { slug: "architecture/data-model", label: "Data model" },
    ],
  },
  {
    section: "Agent",
    items: [
      { slug: "agent/overview", label: "Agent overview" },
      { slug: "agent/installation", label: "Installing the agent" },
      { slug: "agent/reference", label: "Agent reference" },
    ],
  },
  {
    section: "Monitoring",
    items: [
      { slug: "monitoring/metrics", label: "Metrics" },
      { slug: "monitoring/alerts", label: "Alerts" },
      { slug: "monitoring/synthetic-checks", label: "Synthetic checks" },
      { slug: "monitoring/heartbeats", label: "Heartbeats" },
      { slug: "monitoring/notifications", label: "Notifications" },
      { slug: "monitoring/incidents", label: "Incidents & status page" },
    ],
  },
  {
    section: "API",
    items: [
      { slug: "api/rest", label: "REST reference" },
      { slug: "api/auth", label: "Authentication" },
      { slug: "api/websockets", label: "WebSockets" },
    ],
  },
  {
    section: "Deployment",
    items: [
      { slug: "deployment/docker", label: "Docker" },
      { slug: "deployment/kubernetes", label: "Kubernetes (Helm)" },
      { slug: "deployment/reverse-proxy", label: "Reverse proxy & TLS" },
      { slug: "deployment/ha", label: "High availability" },
    ],
  },
  {
    section: "Reference",
    items: [
      { slug: "cli", label: "CLI reference" },
      { slug: "faq", label: "FAQ" },
      { slug: "troubleshooting", label: "Troubleshooting" },
      { slug: "glossary", label: "Glossary" },
    ],
  },
];

const FLAT = NAV.flatMap((s) => s.items);

function findIndex(slug) {
  return FLAT.findIndex((it) => it.slug === slug);
}

function Sidebar({ onNavigate }) {
  return (
    <nav className="space-y-7" aria-label="Documentation">
      {NAV.map((sec) => (
        <div key={sec.section}>
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-3">
            {sec.section}
          </div>
          <ul className="space-y-0.5 border-l border-stroke pl-3">
            {sec.items.map((it) => (
              <li key={it.slug}>
                <NavLink
                  to={`/docs/${it.slug}`}
                  className={({ isActive }) =>
                    `doc-nav-link ${isActive ? "is-active" : ""}`
                  }
                  onClick={onNavigate}
                  end
                >
                  {it.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────
   3.  Layout shell — top bar, sidebar, prose, prev/next
   ───────────────────────────────────────────────────────── */

function TopBar({ onMenuToggle }) {
  return (
    <header className="sticky top-0 z-40 border-b border-stroke bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <ThetaMark size={22} />
          <span className="text-[15px] font-semibold tracking-tight text-fg">
            Theoria
          </span>
          <span className="rounded-md border border-stroke-1 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-2">
            docs
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <Link
            to="/"
            className="hidden text-[13px] text-fg-2 hover:text-fg sm:inline"
          >
            ← Back to site
          </Link>
          <a
            href="https://github.com/Abhra0404/Theoria"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-md border border-stroke-1 bg-surface-1 px-2.5 py-1 text-[13px] text-fg-1 hover:border-stroke-2 hover:text-fg sm:inline-flex"
          >
            <GitHubIcon size={13} /> GitHub
          </a>
          <button
            type="button"
            onClick={onMenuToggle}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stroke-1 bg-surface-1 text-fg-1 lg:hidden"
            aria-label="Toggle docs menu"
          >
            <Menu size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

function PrevNext({ slug }) {
  const i = findIndex(slug);
  if (i === -1) return null;
  const prev = i > 0 ? FLAT[i - 1] : null;
  const next = i < FLAT.length - 1 ? FLAT[i + 1] : null;
  return (
    <nav className="mt-12 grid gap-3 border-t border-stroke pt-6 sm:grid-cols-2">
      {prev ? (
        <Link
          to={`/docs/${prev.slug}`}
          className="card card-glow group flex flex-col p-4"
        >
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-3">
            <ArrowLeft size={11} /> Previous
          </span>
          <span className="mt-1 text-[14px] font-medium text-fg">
            {prev.label}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          to={`/docs/${next.slug}`}
          className="card card-glow group flex flex-col items-end p-4 text-right"
        >
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-3">
            Next <ArrowRight size={11} />
          </span>
          <span className="mt-1 text-[14px] font-medium text-fg">
            {next.label}
          </span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function Breadcrumb({ slug }) {
  const item = FLAT.find((it) => it.slug === slug);
  const sectionEntry = NAV.find((s) =>
    s.items.some((it) => it.slug === slug)
  );
  return (
    <div className="mb-5 flex items-center gap-1.5 font-mono text-[11.5px] text-fg-3">
      <Link to="/docs" className="transition-colors hover:text-fg-1">
        Docs
      </Link>
      {sectionEntry && (
        <>
          <ChevronRight size={11} />
          <span>{sectionEntry.section}</span>
        </>
      )}
      {item && (
        <>
          <ChevronRight size={11} />
          <span className="text-fg-1">{item.label}</span>
        </>
      )}
    </div>
  );
}

function Page({ slug, children }) {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <article>
      {slug && <Breadcrumb slug={slug} />}
      <div className="doc-prose">{children}</div>
      {slug && <PrevNext slug={slug} />}
      <div className="mt-8 text-[12px] text-fg-3">
        Found a typo or missing detail?{" "}
        <a
          href={`https://github.com/Abhra0404/Theoria/edit/main/wiki/${slug}.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-fg-3 underline-offset-2 hover:text-fg-1"
        >
          Edit this page on GitHub
        </a>
        .
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────
   4.  Pages — hand-written from the wiki content
   ───────────────────────────────────────────────────────── */

function PageIndex() {
  const groups = NAV;
  return (
    <Page>
      <H1>Theoria Documentation</H1>
      <P>
        Theoria is a self-hosted observability platform that consolidates
        host metrics, synthetic checks, heartbeats, alerting, incidents and
        a public status page into a single Fastify process. These docs
        cover everything from a five-minute quickstart to high-availability
        deployment.
      </P>

      <Note title="New here?">
        Read{" "}
        <Link to="/docs/introduction">Introduction</Link> for the high-level
        story, then jump into{" "}
        <Link to="/docs/installation">Installation</Link> and{" "}
        <Link to="/docs/quickstart">Quickstart</Link> to get a server
        monitored in five minutes.
      </Note>

      <div className="not-prose mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div
            key={g.section}
            className="card card-glow group p-5"
          >
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-3">
              {g.section}
            </div>
            <ul className="mt-3 space-y-1.5">
              {g.items.map((it) => (
                <li key={it.slug}>
                  <Link
                    to={`/docs/${it.slug}`}
                    className="group/link inline-flex items-center gap-1.5 text-[13.5px] text-fg-1 transition-colors hover:text-brand-bright"
                  >
                    <ChevronRight
                      size={11}
                      className="text-fg-3 transition-colors group-hover/link:text-brand"
                    />
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Page>
  );
}

function Introduction() {
  return (
    <Page slug="introduction">
      <H1>Introduction</H1>
      <P>
        <strong>Theoria</strong> is a self-hosted observability platform
        that consolidates the four signals most teams need into one
        process. It is designed to be easy to run on a single VM, but to
        scale horizontally when you need it. There is no SaaS edition, no
        telemetry phoning home, and everything is Apache 2.0.
      </P>

      <H2 id="four-signals">The four signals</H2>
      <Tbl
        head={["Signal", "What Theoria gives you"]}
        rows={[
          [
            <strong key="m">Metrics</strong>,
            "CPU / memory / disk / network / load from a 5 MB Go agent, plus custom metrics via OpenTelemetry OTLP and plugins.",
          ],
          [
            <strong key="s">Synthetics</strong>,
            "HTTP, TCP, Ping and DNS checks scheduled in-process.",
          ],
          [
            <strong key="h">Heartbeats</strong>,
            "Cron-job monitoring with grace periods (Healthchecks-style).",
          ],
          [
            <strong key="i">Status & Incidents</strong>,
            "Public status page, RSS feed, SVG uptime badge, incident state machine.",
          ],
        ]}
      />

      <H2 id="who-its-for">Who Theoria is for</H2>
      <UL>
        <LI>
          Small platform / SRE teams who want one tool instead of three.
        </LI>
        <LI>
          Solo developers who want to monitor a fleet without paying per
          host.
        </LI>
        <LI>
          Privacy-sensitive orgs that cannot ship telemetry to a SaaS.
        </LI>
      </UL>

      <H2 id="not-for">What Theoria is not</H2>
      <UL>
        <LI>
          A drop-in Datadog replacement for the largest enterprises — APM
          and distributed tracing are out of scope for v1.
        </LI>
        <LI>
          A general-purpose log aggregator. Pair Theoria with Loki / Vector
          if you need full-text logs.
        </LI>
      </UL>

      <H2 id="stack">Tech stack at a glance</H2>
      <Tbl
        head={["Layer", "Technology"]}
        rows={[
          ["Server", "Fastify 5 · Socket.IO 4 · Drizzle ORM · TypeScript 5 · Zod"],
          ["Storage", "PostgreSQL + TimescaleDB (recommended), or in-memory + JSON"],
          ["Cache / pubsub", "Redis (optional, required for HA)"],
          ["Dashboard", "React 19 · Vite · Tailwind · TanStack Query · Zustand · Recharts"],
          ["Agent", "Go 1.25 (static binary, ~5 MB)"],
          ["Plugins", <span key="p">Node.js <C>worker_threads</C> with capability sandbox</span>],
          ["Distribution", "npm · Docker · Helm chart · native installers"],
        ]}
      />
    </Page>
  );
}

function Installation() {
  return (
    <Page slug="installation">
      <H1>Installation</H1>
      <P>
        Theoria can be installed in several ways depending on your
        environment. All installation methods produce the same Fastify
        process listening on a configurable port (default <C>4000</C>).
      </P>

      <H2 id="prerequisites">Prerequisites</H2>
      <Tbl
        head={["Component", "Requirement"]}
        rows={[
          ["Node.js", "≥ 20 LTS"],
          ["RAM", "256 MB minimum, 1 GB recommended"],
          ["Disk", "1 GB for in-memory + JSON; 10+ GB if Postgres is co-located"],
          ["OS", "Linux, macOS or Windows for the server"],
        ]}
      />

      <H2 id="npx">Option 1 — npx (fastest)</H2>
      <Pre lang="bash">npx theoria-cli</Pre>
      <P>Reset state or override defaults:</P>
      <Pre lang="bash">{`npx theoria-cli --reset
npx theoria-cli --port 8080 \\
  --database-url postgres://user:pass@host:5432/theoria`}</Pre>

      <H2 id="docker">Option 2 — Docker</H2>
      <Pre lang="bash">{`docker run -d \\
  --name theoria \\
  -p 4000:4000 \\
  -e JWT_SECRET=$(openssl rand -hex 32) \\
  -v theoria-data:/root/.theoria \\
  ghcr.io/theoria-monitoring/theoria:latest`}</Pre>
      <P>Or with the bundled compose file:</P>
      <Pre lang="bash">{`JWT_SECRET=$(openssl rand -hex 32) docker compose up -d`}</Pre>

      <H2 id="helm">Option 3 — Kubernetes (Helm)</H2>
      <Pre lang="bash">{`helm repo add theoria https://theoria-monitoring.github.io/charts
helm repo update

helm install theoria theoria/theoria \\
  --namespace observability --create-namespace \\
  --set auth.jwtSecret=$(openssl rand -hex 32) \\
  --set config.corsOrigins=https://monitor.example.com \\
  --set database.secretName=theoria-postgres \\
  --set redis.secretName=theoria-redis`}</Pre>

      <H2 id="source">Option 4 — From source</H2>
      <Pre lang="bash">{`git clone https://github.com/theoria-monitoring/theoria.git
cd theoria
npm install
npm run build:client
cd server && npm install && npm run build
node dist/index.js`}</Pre>

      <H2 id="agent">Installing the agent</H2>
      <Tbl
        head={["Platform", "One-liner"]}
        rows={[
          [
            "Linux / macOS",
            <C key="l">curl -fsSL https://get.theoria.io/agent.sh | sudo sh -s -- --url https://… --key …</C>,
          ],
          [
            "Windows",
            <C key="w">iwr https://get.theoria.io/agent.ps1 -useb | iex; Install-TheoriaAgent -Url '…' -Key '…'</C>,
          ],
          [
            "Anywhere with Node",
            <C key="n">npx theoria-cli agent --url … --key …</C>,
          ],
        ]}
      />

      <H2 id="verify">Verifying the install</H2>
      <Pre lang="bash">{`curl http://localhost:4000/health
curl http://localhost:4000/api/docs.json | jq '.info.version'`}</Pre>
    </Page>
  );
}

function Quickstart() {
  return (
    <Page slug="quickstart">
      <H1>Quickstart</H1>
      <P>
        This walkthrough takes you from zero to a monitored server with one
        alert and one synthetic check in five minutes.
      </P>

      <H2 id="step-1">1. Start the server</H2>
      <Pre lang="bash">npx theoria-cli</Pre>
      <P>
        On first run Theoria writes admin credentials to{" "}
        <C>~/.theoria/admin-credentials.txt</C> and starts listening on port{" "}
        <C>4000</C>.
      </P>

      <H2 id="step-2">2. Grab your API key</H2>
      <P>
        Open <C>http://localhost:4000</C>, sign in with the bootstrapped
        password, and copy your API key from <strong>Settings → API key</strong>.
        Or fetch it from the API:
      </P>
      <Pre lang="bash">{`curl -s http://localhost:4000/api/auth/me \\
  -H "Authorization: Bearer <JWT>" | jq -r .apiKey`}</Pre>

      <H2 id="step-3">3. Run an agent</H2>
      <Pre lang="bash">{`npx theoria-cli agent \\
  --url http://<theoria-host>:4000 \\
  --key <API_KEY> \\
  --id $(hostname)`}</Pre>
      <P>
        Within five seconds the dashboard's <strong>Servers</strong> page
        shows the host with live CPU / memory / disk / network charts.
      </P>

      <H2 id="step-4">4. Add an alert</H2>
      <Pre lang="bash">{`curl -X POST http://localhost:4000/api/alerts/rules \\
  -H "Authorization: Bearer <JWT>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "High CPU",
    "metricName": "cpu_usage",
    "operator": ">",
    "threshold": 85,
    "durationMinutes": 5,
    "severity": "warning"
  }'`}</Pre>

      <H2 id="step-5">5. Add a synthetic HTTP check</H2>
      <Pre lang="bash">{`curl -X POST http://localhost:4000/api/http-checks \\
  -H "Authorization: Bearer <JWT>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Public website",
    "url": "https://example.com",
    "intervalSeconds": 60,
    "expectedStatus": 200,
    "timeoutMs": 10000
  }'`}</Pre>

      <H2 id="step-6">6. Wire up notifications</H2>
      <Pre lang="bash">{`curl -X POST http://localhost:4000/api/notifications/channels \\
  -H "Authorization: Bearer <JWT>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Ops Slack",
    "type": "slack",
    "config": {
      "webhookUrl": "https://hooks.slack.com/services/T0/B0/XXXX"
    }
  }'`}</Pre>
      <P>Send a test notification:</P>
      <Pre lang="bash">{`curl -X POST http://localhost:4000/api/notifications/channels/<id>/test \\
  -H "Authorization: Bearer <JWT>"`}</Pre>

      <H2 id="next">What's next</H2>
      <UL>
        <LI>
          Read <Link to="/docs/configuration">Configuration</Link> before
          going to production.
        </LI>
        <LI>
          Tune your rules using <Link to="/docs/monitoring/alerts">Alerts</Link>.
        </LI>
        <LI>
          Add more probes with{" "}
          <Link to="/docs/monitoring/synthetic-checks">Synthetic checks</Link>.
        </LI>
      </UL>
    </Page>
  );
}

function Configuration() {
  return (
    <Page slug="configuration">
      <H1>Configuration</H1>
      <P>
        Theoria is configured by environment variables. Single-node
        installs additionally read first-run answers from{" "}
        <C>~/.theoria/config.json</C>. Precedence is:{" "}
        <strong>CLI flags &gt; env &gt; config.json &gt; defaults</strong>.
      </P>

      <H2 id="core">Core</H2>
      <Tbl
        head={["Variable", "Default", "Description"]}
        rows={[
          [<C key="p">PORT</C>, <C key="p2">4000</C>, "Fastify listen port"],
          [<C key="h">HOST</C>, <C key="h2">0.0.0.0</C>, "Bind address"],
          [<C key="ne">NODE_ENV</C>, <C key="ne2">development</C>, <span><C>production</C> enables stricter defaults</span>],
          [<C key="ll">LOG_LEVEL</C>, <C key="ll2">info</C>, "trace · debug · info · warn · error · fatal"],
          [<C key="co">CORS_ORIGINS</C>, "—", <span>Comma-separated origins. <strong>Required</strong> in prod; <C>*</C> is rejected</span>],
        ]}
      />

      <H2 id="storage">Storage</H2>
      <Tbl
        head={["Variable", "Default", "Description"]}
        rows={[
          [<C key="d">DATABASE_URL</C>, "—", "Postgres DSN. When unset, Theoria uses an in-memory store with JSON snapshot"],
          [<C key="r">REDIS_URL</C>, "—", "Redis DSN. Required for HA"],
          [<C key="td">THEORIA_DATA_DIR</C>, <C key="td2">~/.theoria</C>, "Directory for JSON backup, plugin installs, and uploads"],
        ]}
      />

      <H2 id="auth">Authentication</H2>
      <Tbl
        head={["Variable", "Default", "Description"]}
        rows={[
          [<C key="j">JWT_SECRET</C>, "auto-generated in dev", <span>HS256 signing secret. <strong>Must be set</strong> in production</span>],
          [<C key="ja">JWT_ACCESS_TTL</C>, <C key="ja2">15m</C>, "Access token lifetime"],
          [<C key="jr">JWT_REFRESH_TTL</C>, <C key="jr2">30d</C>, "Refresh token lifetime"],
          [<C key="b">BCRYPT_ROUNDS</C>, <C key="b2">12</C>, "bcrypt cost factor"],
          [<C key="lt">LOCKOUT_THRESHOLD</C>, <C key="lt2">5</C>, "Failed logins before account lockout"],
          [<C key="ld">LOCKOUT_DURATION_SECONDS</C>, <C key="ld2">900</C>, "Lockout duration (15 min)"],
        ]}
      />

      <H2 id="rate-limit">Rate limiting</H2>
      <Tbl
        head={["Variable", "Default", "Description"]}
        rows={[
          [<C key="ra">RATE_LIMIT_AUTH_PER_MIN</C>, <C key="ra2">10</C>, "Login / register attempts per IP per minute"],
          [<C key="rm">RATE_LIMIT_METRICS_PER_SEC</C>, <C key="rm2">10</C>, "Agent ingestion rate per IP per second"],
          [<C key="rh">RATE_LIMIT_HEARTBEAT_PER_MIN</C>, <C key="rh2">60</C>, "Heartbeat pings per slug per minute"],
        ]}
      />

      <H2 id="observability">Observability</H2>
      <Tbl
        head={["Variable", "Default", "Description"]}
        rows={[
          [<C key="s1">SENTRY_DSN</C>, "—", "Optional Sentry DSN"],
          [<C key="s2">SENTRY_ENVIRONMENT</C>, <C key="se">NODE_ENV</C>, "Environment tag"],
          [<C key="s3">SENTRY_TRACES_SAMPLE_RATE</C>, <C key="sr">0.0</C>, "0.0 – 1.0"],
          [<C key="im">INTERNAL_METRICS_ENABLED</C>, <C key="im2">true</C>, <span>Exposes Prometheus self-metrics at <C>/internal/metrics</C></span>],
        ]}
      />

      <H2 id="config-json">~/.theoria/config.json</H2>
      <Pre lang="json">{`{
  "version": 2,
  "port": 4000,
  "databaseUrl": null,
  "createdAt": "2026-04-01T12:00:00.000Z"
}`}</Pre>

      <H2 id="checklist">Production checklist</H2>
      <Note tone="warn" title="Before going live">
        <UL>
          <LI><C>JWT_SECRET</C> is a cryptographically random 32-byte hex string</LI>
          <LI><C>CORS_ORIGINS</C> is set to the exact dashboard origin (no <C>*</C>)</LI>
          <LI><C>DATABASE_URL</C> points at Postgres with the <C>timescaledb</C> extension</LI>
          <LI><C>REDIS_URL</C> is set if you run more than one server replica</LI>
          <LI><C>NODE_ENV=production</C></LI>
          <LI>Theoria sits behind a TLS-terminating reverse proxy</LI>
          <LI>Backups of the database and <C>~/.theoria</C> are scheduled</LI>
        </UL>
      </Note>
    </Page>
  );
}

function ArchitectureOverview() {
  return (
    <Page slug="architecture/overview">
      <H1>Architecture Overview</H1>
      <P>
        Theoria is built around a single Fastify process that owns
        ingestion, scheduling, alert evaluation, real-time fan-out and
        serving the React dashboard. State lives in PostgreSQL (with the
        TimescaleDB extension for hypertables); Redis is added for
        horizontally-scaled deployments.
      </P>

      <H2 id="diagram">High-level diagram</H2>
      <Pre lang="text">{`┌─────────┐   POST /metrics        ┌────────────────────┐
│  Agent  │ ─────────────────────▶ │                    │
└─────────┘                        │   Theoria Server   │
                                   │  (Fastify · Node)  │
┌─────────┐   POST /v1/metrics     │                    │
│  OTLP   │ ─────────────────────▶ │  • REST API        │
└─────────┘                        │  • Socket.IO       │
                                   │  • Alert engine    │
┌─────────┐   POST /heartbeats/…   │  • Plugin runtime  │
│  Cron   │ ─────────────────────▶ │  • Status page     │
└─────────┘                        └─────────┬──────────┘
                                             │
                                  ┌──────────▼──────────┐
                                  │ Postgres/Timescale  │
                                  │       Redis         │
                                  └─────────────────────┘`}</Pre>

      <H2 id="responsibilities">Responsibilities</H2>
      <Tbl
        head={["Component", "Responsibility"]}
        rows={[
          [<strong key="f">Fastify server</strong>, "HTTP API, scheduling, alert evaluation, plugin host, dashboard delivery, status page"],
          [<strong key="r">React SPA</strong>, "Dashboard UI served as static bundle from the same process"],
          [<strong key="a">Agent</strong>, <span>Collect host metrics every 5 s and POST them to <C>/metrics</C></span>],
          [<strong key="p">Postgres + Timescale</strong>, "Source of truth for users, servers, rules, history; hypertables for time-series"],
          [<strong key="re">Redis (optional)</strong>, "Socket.IO adapter for HA, distributed rate limit, lockout state"],
        ]}
      />

      <H2 id="modes">Two deployment modes</H2>
      <H3 id="single">Single-node (zero config)</H3>
      <UL>
        <LI>No external dependencies</LI>
        <LI>All state in-memory + JSON file at <C>~/.theoria/store.json</C></LI>
        <LI>Suitable for ≤ 50 monitored hosts and a single operator</LI>
      </UL>

      <H3 id="ha">High-availability</H3>
      <UL>
        <LI>≥ 2 server replicas behind a load balancer</LI>
        <LI>PostgreSQL + TimescaleDB for durable state</LI>
        <LI>Redis for Socket.IO room replication and shared rate limit</LI>
      </UL>

      <H2 id="hot-path">Hot path: metric ingestion</H2>
      <Pre lang="text">{`Agent ──POST /metrics──▶ Fastify
                             │ 1. validate API key (constant-time)
                             │ 2. upsert servers row (last_seen)
                             │ 3. INSERT metric data points (hypertable)
                             │ 4. evaluate alert rules (breach state Map)
                             │ 5. emit Socket.IO \`metric:update\`
                             │ 6. fire notifications if rules cross threshold
                             ▼
                         200 OK`}</Pre>

      <H2 id="realtime">Real-time fan-out</H2>
      <Tbl
        head={["Event", "Payload", "Fired when"]}
        rows={[
          [<C key="m">metric:update</C>, "data point + server snapshot", "Agent posts metrics"],
          [<C key="af">alert:fired</C>, "full alert record", "Rule crosses threshold"],
          [<C key="ar">alert:resolved</C>, "alert + duration", "Metric returns within bounds"],
          [<C key="cr">check:result</C>, "check id + status + latency", "Synthetic check completes"],
          [<C key="iu">incident:update</C>, "incident + new update", "Operator posts an update"],
        ]}
      />
    </Page>
  );
}

function AgentOverview() {
  return (
    <Page slug="agent/overview">
      <H1>Agent overview</H1>
      <P>
        The Theoria agent is a small, statically-linked Go binary you run
        on every host you want to monitor. It collects system metrics
        every five seconds and POSTs them as a single JSON payload to the
        Theoria server.
      </P>

      <H2 id="goals">Design goals</H2>
      <UL>
        <LI>
          <strong>Tiny footprint</strong> — single binary, no runtime, no
          dependencies. ~5 MB on disk, &lt; 20 MB resident memory.
        </LI>
        <LI>
          <strong>Crash-only</strong> — never buffers, never persists; if
          the server is down it skips a tick.
        </LI>
        <LI>
          <strong>Cross-platform</strong> — Linux, macOS, Windows from one
          source tree.
        </LI>
        <LI>
          <strong>Privileged but bounded</strong> — runs as an unprivileged
          user under a service manager. Reads <C>/proc</C>, <C>/sys</C> or
          platform equivalents.
        </LI>
        <LI>
          <strong>Pull-free</strong> — no scrape endpoint to expose. The
          agent only opens outbound connections.
        </LI>
      </UL>

      <H2 id="collects">What it collects</H2>
      <Tbl
        head={["Group", "Fields"]}
        rows={[
          ["CPU", <span key="c"><C>cpu_usage</C> (%), <C>cpu_count</C></span>],
          ["Memory", <span key="m"><C>memory_total_bytes</C>, <C>memory_free_bytes</C>, <C>memory_usage_percent</C></span>],
          ["Disk", <span key="d"><C>disk_total_bytes</C>, <C>disk_free_bytes</C>, <C>disk_usage_percent</C></span>],
          ["Network", <span key="n"><C>network_rx_bytes_per_sec</C>, <C>network_tx_bytes_per_sec</C></span>],
          ["Load (Unix)", <span key="l"><C>load_avg_1m</C>, <C>load_avg_5m</C>, <C>load_avg_15m</C></span>],
          ["System", <span key="s"><C>system_uptime_seconds</C>, <C>platform</C>, <C>arch</C>, <C>hostname</C></span>],
          ["Containers (opt-in)", <span key="cn">per-container <C>cpu_percent</C>, <C>mem_*</C>, <C>net_rx/tx</C>, <C>state</C>, <C>image</C></span>],
        ]}
      />

      <H2 id="payload">Wire format</H2>
      <Pre lang="http">{`POST /metrics
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "serverId": "web-1",
  "cpu": 32.4,
  "totalMem": 16777216000,
  "freeMem":  8388608000,
  "uptime": 1234567,
  "loadAvg1": 0.42,
  "loadAvg5": 0.51,
  "loadAvg15": 0.66,
  "diskTotal": 500000000000,
  "diskFree":  320000000000,
  "networkRx": 102400,
  "networkTx": 204800,
  "cpuCount": 8,
  "platform": "linux",
  "arch": "amd64",
  "hostname": "web-1",
  "timestamp": 1761515430123
}`}</Pre>
    </Page>
  );
}

function Metrics() {
  return (
    <Page slug="monitoring/metrics">
      <H1>Metrics & time-series</H1>
      <P>
        Theoria stores all numeric observations in a single hypertable,{" "}
        <C>metrics</C>, partitioned by time.
      </P>

      <H2 id="sources">Sources</H2>
      <Tbl
        head={["Source", "Endpoint", "Frequency", "Examples"]}
        rows={[
          ["Theoria agent", <C key="m">POST /metrics</C>, "every 5 s", <C key="cu">cpu_usage</C>],
          ["OpenTelemetry sender", <C key="o">POST /v1/metrics</C>, "per push", "Prometheus gauge / sum / histogram"],
          ["Plugins", "internal SDK", "plugin-defined", <C key="mp">mongo_current_connections</C>],
        ]}
      />

      <H2 id="query">Querying history</H2>
      <Pre lang="http">{`GET /api/servers/web-1/metrics?timeRange=24h
Authorization: Bearer <jwt>`}</Pre>
      <Pre lang="json">{`{
  "serverId": "web-1",
  "from": "2026-04-25T12:00:00.000Z",
  "to":   "2026-04-26T12:00:00.000Z",
  "metrics": {
    "cpu_usage":              [ { "t": 1761516000000, "v": 32.4 }, … ],
    "memory_usage_percent":   [ … ],
    "disk_usage_percent":     [ … ],
    "network_rx_bytes_per_sec": [ … ],
    "network_tx_bytes_per_sec": [ … ]
  }
}`}</Pre>
      <P>
        <C>timeRange</C> accepts <C>5m</C>, <C>15m</C>, <C>1h</C>,{" "}
        <C>6h</C>, <C>24h</C>, <C>7d</C>.
      </P>

      <H2 id="custom">Custom metrics via OTLP</H2>
      <Pre lang="bash">{`curl -X POST https://monitor.example.com/v1/metrics \\
  -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "resourceMetrics": [{
      "resource": { "attributes": [{ "key": "service.name",
                                     "value": { "stringValue": "checkout" } }] },
      "scopeMetrics": [{
        "metrics": [{
          "name": "checkout.orders.completed",
          "sum": {
            "dataPoints": [{ "asInt": "42",
                             "timeUnixNano": "1761516000000000000" }],
            "aggregationTemporality": 2,
            "isMonotonic": true
          }
        }]
      }]
    }]
  }'`}</Pre>

      <H2 id="retention">Retention</H2>
      <Tbl
        head={["Tier", "Window"]}
        rows={[
          ["Raw data", <span key="r">7 days (configurable via <C>TIMESCALE_METRICS_RETENTION</C>)</span>],
          ["Compressed chunks", "after 24 hours"],
          ["Beyond retention", <span key="b">dropped; export with <C>pg_dump</C> for cold storage</span>],
        ]}
      />

      <H2 id="thresholds">Recommended alert thresholds</H2>
      <Tbl
        head={["Metric", "Operator", "Threshold", "Duration"]}
        rows={[
          [<C key="c">cpu_usage</C>, ">", "85", "10 min"],
          [<C key="m">memory_usage_percent</C>, ">", "90", "5 min"],
          [<C key="d">disk_usage_percent</C>, ">", "90", "0 (page immediately)"],
          [<C key="l">load_avg_5m</C>, ">", "cpuCount × 1.5", "10 min"],
        ]}
      />
    </Page>
  );
}

function Alerts() {
  return (
    <Page slug="monitoring/alerts">
      <H1>Alerts</H1>
      <P>
        Theoria alerts are threshold rules evaluated against incoming
        metrics on the hot path. Rules can be flat ("fire when CPU &gt;
        90%") or duration-based ("fire only if CPU &gt; 85% for 10
        minutes").
      </P>

      <H2 id="anatomy">Anatomy of a rule</H2>
      <Pre lang="json">{`{
  "name": "Web tier CPU saturated",
  "metricName": "cpu_usage",
  "labels": { "tier": "web" },
  "operator": ">",
  "threshold": 85,
  "durationMinutes": 10,
  "severity": "warning",
  "isActive": true
}`}</Pre>

      <Tbl
        head={["Field", "Type", "Notes"]}
        rows={[
          [<C key="n">name</C>, "string", "Free-form label, displayed in notifications"],
          [<C key="m">metricName</C>, "string", "Must match a metric the system actually receives"],
          [<C key="l">labels</C>, "jsonb", "Optional. Acts as an AND filter on metric labels"],
          [<C key="o">operator</C>, "enum", <C key="oo">{"< > <= >= == !="}</C>],
          [<C key="t">threshold</C>, "number", "Compared against the metric value"],
          [<C key="d">durationMinutes</C>, "number", <span>Must remain in breach this long. <C>0</C> = page immediately</span>],
          [<C key="s">severity</C>, "enum", "info · warning · error · critical"],
          [<C key="i">isActive</C>, "bool", "Toggle without deleting"],
        ]}
      />

      <H2 id="severity">Severity semantics</H2>
      <Tbl
        head={["Severity", "Recommended use", "Default routing"]}
        rows={[
          [<C key="i">info</C>, "Informational, no human action expected", "Slack info channel"],
          [<C key="w">warning</C>, "Investigate at business hours", "Slack ops channel"],
          [<C key="e">error</C>, "Investigate now", "Slack + email"],
          [<C key="c">critical</C>, "Page someone", "Slack + email + PagerDuty"],
        ]}
      />

      <H2 id="crud">CRUD</H2>
      <Pre lang="bash">{`# Create
curl -X POST https://monitor.example.com/api/alerts/rules \\
  -H "Authorization: Bearer <jwt>" \\
  -H "Content-Type: application/json" \\
  -d @rule.json

# List
curl https://monitor.example.com/api/alerts/rules \\
  -H "Authorization: Bearer <jwt>"

# Toggle
curl -X PATCH https://monitor.example.com/api/alerts/rules/<id>/toggle \\
  -H "Authorization: Bearer <jwt>"

# Delete
curl -X DELETE https://monitor.example.com/api/alerts/rules/<id> \\
  -H "Authorization: Bearer <jwt>"`}</Pre>

      <H2 id="lifecycle">Lifecycle</H2>
      <Pre lang="text">{`        evaluate every metric
                 │
                 ▼
       in breach now? ──no──▶ if open: resolve, emit alert:resolved
                 │
                yes
                 │
                 ▼
       breach state Map: first-seen-at = now (if absent)
                 │
                 ▼
       seen long enough (≥ durationMinutes)? ──no──▶ keep watching
                 │
                yes
                 │
                 ▼
   INSERT into alert_history (status="firing")
   emit alert:fired over Socket.IO
   dispatch to notification channels`}</Pre>

      <H2 id="best">Best practices</H2>
      <UL>
        <LI>
          <strong>Use <C>durationMinutes</C> aggressively.</strong> Most
          operational metrics flap; a sustained breach reduces noise.
        </LI>
        <LI>
          <strong>Use labels to scope rules.</strong> One rule with{" "}
          <C>{`labels: {"role":"db"}`}</C> beats one rule per host.
        </LI>
        <LI>
          <strong>Pair every page with a runbook.</strong> Put a link in
          the rule <C>name</C>.
        </LI>
        <LI>
          <strong>Snapshot rules in version control.</strong> Apply via{" "}
          <C>curl</C> in CI.
        </LI>
      </UL>
    </Page>
  );
}

function SyntheticChecks() {
  return (
    <Page slug="monitoring/synthetic-checks">
      <H1>Synthetic checks</H1>
      <P>
        Synthetic checks probe your services on a schedule from inside the
        Theoria server. There are four kinds — HTTP, TCP, Ping, DNS — and
        they share an identical CRUD surface.
      </P>

      <H2 id="http">HTTP</H2>
      <Pre lang="bash">{`curl -X POST https://monitor.example.com/api/http-checks \\
  -H "Authorization: Bearer <jwt>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Public website",
    "url": "https://example.com/health",
    "intervalSeconds": 60,
    "expectedStatus": 200,
    "timeoutMs": 10000
  }'`}</Pre>

      <H2 id="tcp">TCP</H2>
      <Pre lang="bash">{`curl -X POST https://monitor.example.com/api/tcp-checks \\
  -H "Authorization: Bearer <jwt>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Postgres reachable",
    "host": "db.internal",
    "port": 5432,
    "intervalSeconds": 30,
    "timeoutMs": 5000
  }'`}</Pre>

      <H2 id="ping">Ping</H2>
      <Note tone="warn" title="Privilege required">
        ICMP requires that the Theoria server process either runs as root
        or has the <C>cap_net_raw</C> capability.
      </Note>
      <Pre lang="bash">{`curl -X POST https://monitor.example.com/api/ping-checks \\
  -H "Authorization: Bearer <jwt>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Edge router",
    "host": "edge-1.internal",
    "intervalSeconds": 30
  }'`}</Pre>

      <H2 id="dns">DNS</H2>
      <Pre lang="bash">{`curl -X POST https://monitor.example.com/api/dns-checks \\
  -H "Authorization: Bearer <jwt>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "MX record present",
    "domain": "example.com",
    "recordType": "MX",
    "expected": "aspmx.l.google.com",
    "intervalSeconds": 300
  }'`}</Pre>
      <Tbl
        head={["Field", "Notes"]}
        rows={[
          [<C key="r">recordType</C>, "A · AAAA · CNAME · MX · TXT · NS · SOA"],
          [<C key="e">expected</C>, "Optional substring assertion against the resolved value"],
        ]}
      />

      <H2 id="crud">CRUD operations</H2>
      <Tbl
        head={["Action", "Method", "Path"]}
        rows={[
          ["List", <C key="l">GET</C>, <C key="l2">/api/&lt;kind&gt;-checks</C>],
          ["Detail", <C key="d">GET</C>, <C key="d2">/api/&lt;kind&gt;-checks/:id</C>],
          ["Create", <C key="c">POST</C>, <C key="c2">/api/&lt;kind&gt;-checks</C>],
          ["Toggle", <C key="t">PATCH</C>, <C key="t2">/api/&lt;kind&gt;-checks/:id/toggle</C>],
          ["Delete", <C key="de">DELETE</C>, <C key="de2">/api/&lt;kind&gt;-checks/:id</C>],
        ]}
      />
    </Page>
  );
}

function Notifications() {
  return (
    <Page slug="monitoring/notifications">
      <H1>Notifications</H1>
      <P>
        Notification channels deliver alerts and incident updates to the
        systems your team already uses.
      </P>

      <H2 id="types">Supported channel types</H2>
      <Tbl
        head={["Type", "Required config"]}
        rows={[
          [<C key="s">slack</C>, <C key="s2">webhookUrl</C>],
          [<C key="d">discord</C>, <C key="d2">webhookUrl</C>],
          [<C key="t">teams</C>, <C key="t2">webhookUrl</C>],
          [<C key="e">email</C>, <C key="e2">smtpHost, smtpPort, smtpUser, smtpPass, from, to</C>],
          [<C key="te">telegram</C>, <C key="te2">botToken, chatId</C>],
          [<C key="w">webhook</C>, <C key="w2">url, headers (opt), secret (opt)</C>],
          [<C key="p">pagerduty</C>, <C key="p2">routingKey</C>],
        ]}
      />

      <H2 id="slack">Create a Slack channel</H2>
      <Pre lang="bash">{`curl -X POST https://monitor.example.com/api/notifications/channels \\
  -H "Authorization: Bearer <jwt>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Ops Slack",
    "type": "slack",
    "config": {
      "webhookUrl": "https://hooks.slack.com/services/T0/B0/XXXX"
    }
  }'`}</Pre>

      <H2 id="email">Create an Email channel</H2>
      <Pre lang="bash">{`curl -X POST https://monitor.example.com/api/notifications/channels \\
  -H "Authorization: Bearer <jwt>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "On-call email",
    "type": "email",
    "config": {
      "smtpHost": "smtp.sendgrid.net",
      "smtpPort": 587,
      "smtpUser": "apikey",
      "smtpPass": "SG.…",
      "from": "alerts@example.com",
      "to":   "oncall@example.com"
    }
  }'`}</Pre>

      <H2 id="webhook">Webhook payload</H2>
      <Pre lang="json">{`{
  "event": "alert:fired",
  "alert": {
    "id": "uuid",
    "ruleId": "uuid",
    "ruleName": "Web tier CPU saturated",
    "metricName": "cpu_usage",
    "operator": ">",
    "threshold": 85,
    "actualValue": 92.4,
    "severity": "warning",
    "firedAt": "2026-04-26T10:00:00.000Z",
    "labels": { "tier": "web", "host": "web-1" },
    "message": "cpu_usage was 92.4 (> 85) for 10m on web-1"
  },
  "deployment": { "url": "https://monitor.example.com" }
}`}</Pre>

      <H2 id="best">Best practices</H2>
      <UL>
        <LI>Test channels in staging before production.</LI>
        <LI>Use one channel per route — separate Slack channels for <C>info</C> vs <C>critical</C>.</LI>
        <LI>Page only on <C>critical</C>. Flooding PagerDuty teaches on-call to ignore it.</LI>
        <LI>Rotate <C>smtpPass</C> and webhook secrets on the same cadence as other credentials.</LI>
      </UL>
    </Page>
  );
}

function CliReference() {
  return (
    <Page slug="cli">
      <H1>CLI reference</H1>
      <P>
        The <C>theoria-cli</C> package is the launcher and ops tool for
        Theoria.
      </P>

      <Pre lang="bash">{`npx theoria-cli [command] [options]`}</Pre>

      <H2 id="commands">Commands</H2>
      <Tbl
        head={["Command", "Purpose"]}
        rows={[
          [<C key="s">theoria-cli</C>, "Start the server (default)"],
          [<C key="a">theoria-cli agent</C>, "Run the bundled agent"],
          [<C key="pi">theoria-cli plugin install &lt;pkg&gt;</C>, "Install a plugin from npm"],
          [<C key="pl">theoria-cli plugin list</C>, "List installed plugins"],
          [<C key="pr">theoria-cli plugin remove &lt;pkg&gt;</C>, "Remove a plugin"],
          [<C key="pt">theoria-cli plugin test &lt;path&gt;</C>, "Run a plugin locally with mocked capabilities"],
          [<C key="m">theoria-cli migrate</C>, "Run pending Drizzle migrations and exit"],
          [<C key="v">theoria-cli --version</C>, "Print the CLI version"],
          [<C key="h">theoria-cli --help</C>, "Print help"],
        ]}
      />

      <H2 id="server-flags">Server flags</H2>
      <Tbl
        head={["Flag", "Default", "Description"]}
        rows={[
          [<C key="p">--port &lt;n&gt;</C>, <C key="p2">4000</C>, "Listen port"],
          [<C key="ho">--host &lt;addr&gt;</C>, <C key="ho2">0.0.0.0</C>, "Bind address"],
          [<C key="d">--database-url &lt;dsn&gt;</C>, <C key="d2">env DATABASE_URL</C>, "Postgres DSN; falls back to in-memory"],
          [<C key="r">--redis-url &lt;url&gt;</C>, <C key="r2">env REDIS_URL</C>, "Redis URL; required for HA"],
          [<C key="re">--reset</C>, "—", "Wipe ~/.theoria/store.json (in-memory mode)"],
          [<C key="rd">--reset-database</C>, "—", "Drop migrations table (destructive)"],
          [<C key="dd">--data-dir &lt;path&gt;</C>, <C key="dd2">~/.theoria</C>, "Override config + plugin dir"],
          [<C key="ll">--log-level &lt;lvl&gt;</C>, <C key="ll2">info</C>, "Pino log level"],
          [<C key="m">--maintenance</C>, "—", "Start in maintenance mode"],
        ]}
      />

      <H2 id="agent-flags">Agent flags</H2>
      <Tbl
        head={["Flag", "Env", "Default", "Description"]}
        rows={[
          [<C key="u">--url</C>, <C key="u2">API_URL</C>, "—", "Server base URL (required)"],
          [<C key="k">--key</C>, <C key="k2">API_KEY</C>, "—", "Per-server API key (required)"],
          [<C key="i">--id</C>, <C key="i2">SERVER_ID</C>, "auto", "Override server ID"],
          [<C key="iv">--interval</C>, <C key="iv2">INTERVAL_MS</C>, <C key="iv3">5000</C>, "Collection interval"],
          [<C key="n">--name</C>, <C key="n2">SERVER_NAME</C>, "hostname", "Display name"],
          [<C key="dk">--docker</C>, <C key="dk2">DOCKER=true</C>, "off", "Enable Docker collection"],
          [<C key="ot">--otel</C>, <C key="ot2">OTEL=true</C>, "off", "Enable OTLP receiver on the agent"],
        ]}
      />

      <H2 id="exit">Exit codes</H2>
      <Tbl
        head={["Code", "Meaning"]}
        rows={[
          [<C key="0">0</C>, "Clean shutdown"],
          [<C key="1">1</C>, "Uncaught exception during runtime"],
          [<C key="2">2</C>, "Invalid CLI usage"],
          [<C key="10">10</C>, "Database migration failed"],
          [<C key="11">11</C>, "Database unreachable"],
          [<C key="12">12</C>, "Redis unreachable (and required)"],
          [<C key="20">20</C>, "Port already in use"],
        ]}
      />

      <H2 id="precedence">Precedence</H2>
      <P>
        CLI flags &gt; environment variables &gt;{" "}
        <C>~/.theoria/config.json</C> &gt; defaults.
      </P>
    </Page>
  );
}

function Faq() {
  return (
    <Page slug="faq">
      <H1>FAQ</H1>

      <H2 id="general">General</H2>
      <H3>What is Theoria?</H3>
      <P>
        A self-hosted observability platform that combines host /
        container metrics, synthetic checks, heartbeats, alerting and a
        status page in one binary you control.
      </P>
      <H3>Is there a SaaS edition?</H3>
      <P>No. Theoria is intentionally self-hosted: your data stays in your infrastructure.</P>
      <H3>What's the licence?</H3>
      <P>Apache 2.0.</P>

      <H2 id="arch">Architecture</H2>
      <H3>Can I run Theoria without Postgres?</H3>
      <P>
        Yes — for evaluation. With <C>DATABASE_URL</C> unset, Theoria uses
        an in-memory store with a JSON snapshot at{" "}
        <C>~/.theoria/store.json</C>. Metric history is <strong>not</strong>{" "}
        persisted in this mode. Use Postgres for any production use.
      </P>
      <H3>Can I run Theoria without Redis?</H3>
      <P>Yes — for single-replica deployments. Redis is required only if you run multiple application replicas (HA).</P>

      <H2 id="agents">Agents</H2>
      <H3>Which platforms does the agent support?</H3>
      <P>Linux (amd64, arm64), macOS (amd64, arm64), Windows (amd64). The agent is a single static Go binary.</P>
      <H3>Does the agent expose ports?</H3>
      <P>Only when <C>--otel</C> is set (default port 4318 for OTLP HTTP). Otherwise the agent is purely outbound.</P>
      <H3>How much overhead does the agent add?</H3>
      <P>Typical: 5–20 MiB resident memory and &lt; 1% CPU on a modern host. It rises with <C>--docker</C> proportional to the number of running containers.</P>

      <H2 id="plugins">Plugins</H2>
      <H3>Are plugins safe?</H3>
      <P>Plugins run inside <C>worker_threads</C> with a capability allowlist that restricts filesystem, network and process access. Treat unknown community plugins as you would any third-party code.</P>
      <H3>Can plugins access the database directly?</H3>
      <P>No. Plugins use the <C>kv</C> capability for per-instance state and <C>metrics.gauge</C> / <C>metrics.counter</C> to publish derived metrics.</P>

      <H2 id="security">Security</H2>
      <H3>How are secrets stored?</H3>
      <P><C>JWT_SECRET</C> and <C>DATABASE_URL</C> are read from environment variables; rotate them via your secrets manager. API keys are stored as <C>argon2id</C> hashes in Postgres. Plugin configs marked <C>format: password</C> are masked in API responses.</P>
      <H3>Can I integrate SSO?</H3>
      <P>Native SSO (OIDC, SAML) is on the roadmap. Today, you can front Theoria with an authenticating proxy (oauth2-proxy, Authelia, Cloudflare Access) and trust the proxy's identity headers via <C>TRUSTED_PROXIES</C>.</P>
    </Page>
  );
}

function Stub({ title, slug }) {
  return (
    <Page slug={slug}>
      <H1>{title}</H1>
      <Note title="Page in progress">
        We're still polishing this page for the docs site. In the meantime
        the full content lives in the GitHub wiki:
        <div className="not-prose mt-3">
          <a
            href={`https://github.com/Abhra0404/Theoria/blob/main/wiki/${slug}.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-brand-line bg-brand-soft px-3 py-1.5 font-mono text-[12px] text-brand-bright hover:border-brand"
          >
            <GitHubIcon size={12} /> wiki/{slug}.md
          </a>
        </div>
      </Note>
      <P>
        Want this page first? <a href="https://github.com/Abhra0404/Theoria/issues/new">Open an issue</a> and tell us what's most useful to cover.
      </P>
    </Page>
  );
}

/* ─────────────────────────────────────────────────────────
   5.  Routes table
   ───────────────────────────────────────────────────────── */

const ROUTES = [
  { path: "", element: <PageIndex /> },
  { path: "introduction", element: <Introduction /> },
  { path: "installation", element: <Installation /> },
  { path: "quickstart", element: <Quickstart /> },
  { path: "configuration", element: <Configuration /> },
  { path: "architecture/overview", element: <ArchitectureOverview /> },
  { path: "architecture/components", element: <Stub title="Components" slug="architecture/components" /> },
  { path: "architecture/data-model", element: <Stub title="Data model" slug="architecture/data-model" /> },
  { path: "agent/overview", element: <AgentOverview /> },
  { path: "agent/installation", element: <Stub title="Installing the agent" slug="agent/installation" /> },
  { path: "agent/reference", element: <Stub title="Agent reference" slug="agent/reference" /> },
  { path: "monitoring/metrics", element: <Metrics /> },
  { path: "monitoring/alerts", element: <Alerts /> },
  { path: "monitoring/synthetic-checks", element: <SyntheticChecks /> },
  { path: "monitoring/heartbeats", element: <Stub title="Heartbeats" slug="monitoring/heartbeats" /> },
  { path: "monitoring/notifications", element: <Notifications /> },
  { path: "monitoring/incidents", element: <Stub title="Incidents & status page" slug="monitoring/incidents-and-status-page" /> },
  { path: "api/rest", element: <Stub title="REST reference" slug="api/rest-reference" /> },
  { path: "api/auth", element: <Stub title="Authentication" slug="api/authentication" /> },
  { path: "api/websockets", element: <Stub title="WebSockets" slug="api/websockets" /> },
  { path: "deployment/docker", element: <Stub title="Docker" slug="deployment/docker" /> },
  { path: "deployment/kubernetes", element: <Stub title="Kubernetes (Helm)" slug="deployment/kubernetes-helm" /> },
  { path: "deployment/reverse-proxy", element: <Stub title="Reverse proxy & TLS" slug="deployment/reverse-proxy" /> },
  { path: "deployment/ha", element: <Stub title="High availability" slug="deployment/high-availability" /> },
  { path: "cli", element: <CliReference /> },
  { path: "faq", element: <Faq /> },
  { path: "troubleshooting", element: <Stub title="Troubleshooting" slug="troubleshooting" /> },
  { path: "glossary", element: <Stub title="Glossary" slug="glossary" /> },
];

/* ─────────────────────────────────────────────────────────
   6.  Layout assembly
   ───────────────────────────────────────────────────────── */

export default function Docs() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Close mobile menu when route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <TopBar onMenuToggle={() => setOpen((v) => !v)} />

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <Sidebar />
          </div>
        </aside>

        {/* Sidebar (mobile drawer) */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              aria-label="Close menu"
              className="absolute inset-0 bg-black/60"
              onClick={() => setOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-[260px] overflow-y-auto border-r border-stroke bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-3">
                  Documentation
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stroke-1 bg-surface-1 text-fg-1"
                  aria-label="Close menu"
                >
                  <X size={14} />
                </button>
              </div>
              <Sidebar onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 max-w-3xl">
          <Routes>
            {ROUTES.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <Page>
      <H1>Page not found</H1>
      <P>
        That page does not exist (yet). Try the{" "}
        <Link to="/docs">documentation home</Link>, or browse the sidebar.
      </P>
    </Page>
  );
}
