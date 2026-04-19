<div align="center">

# Theoria

**Self-hosted system monitoring. One command, full dashboard.**

Real-time server metrics, uptime checks, Docker insights, CI/CD visibility, alerting, and a public status page — in a single process, with zero external dependencies.

[![npm](https://img.shields.io/npm/v/theoria-cli?color=2ea44f)](https://www.npmjs.com/package/theoria-cli)
[![license](https://img.shields.io/badge/license-ISC-blue)](#license)
[![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](#prerequisites)
[![go](https://img.shields.io/badge/go-1.25-00ADD8)](agent/go.mod)
[![status](https://img.shields.io/badge/status-active-success)]()

```bash
npx theoria-cli
```

[Quick Start](#quick-start) · [Features](#features) · [Architecture](#architecture) · [Deploying Agents](#deploying-agents) · [Roadmap](#roadmap)

</div>

---

## Table of Contents

- [Why Theoria](#why-theoria)
- [Features](#features)
- [Quick Start](#quick-start)
- [Deploying Agents](#deploying-agents)
- [Docker Deployment](#docker-deployment)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Repository Layout](#repository-layout)
- [Tech Stack](#tech-stack)
- [Development](#development)
- [Testing](#testing)
- [Security](#security)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Why Theoria

Existing tools force a choice: **simplicity or power**.

| Tool | Does Well | Doesn't Cover |
|------|-----------|---------------|
| Uptime Kuma | Endpoint uptime, 90+ notification channels | No server metrics, no CI/CD visibility |
| Beszel | Lightweight server metrics | No endpoint monitoring, no status page |
| Netdata | Per-second metrics, ML anomaly detection | Overwhelming UI, ~150 MB agent footprint |
| Grafana + Prometheus | Industry standard, infinitely flexible | Weekend-long setup, 5+ services to operate |

Theoria combines server metrics, uptime checks, Docker monitoring, pipeline tracking, and a public status page — behind one command and one dashboard. Zero database to install. No YAML to write. No Prometheus/Grafana stack to operate.

## Features

- **Real-time system metrics** — CPU, memory, disk, network, load averages streamed over Socket.IO
- **Multi-server fleet view** — unlimited agents from a single dashboard
- **Alert engine** — threshold + duration conditions with severity levels and resolve tracking
- **Alert history** — timeline of fired and resolved incidents
- **HTTP uptime checks** — with SSL certificate expiry monitoring
- **Docker container monitoring** — per-container CPU, memory, and network
- **CI/CD pipeline tracking** — webhook ingestion for GitHub Actions, GitLab CI, Jenkins, and Bitbucket
- **Notification channels** — Slack webhooks and SMTP email
- **Public status page** — shareable uptime view for customers
- **API key auth** — Bearer-token authenticated metric ingestion
- **Auto-open browser** on startup — Jenkins-style onboarding
- **Dark theme** — GitHub-dark inspired, responsive dashboard
- **Zero-config persistence** — debounced JSON snapshot of config, no database required

## Quick Start

### Prerequisites

- **Node.js 18+** for the server and CLI
- A modern browser for the dashboard

That's it — no MongoDB, no PostgreSQL, no Redis.

### Install and run

```bash
npx theoria-cli
```

On first run, Theoria:

1. Creates `~/.theoria/config.json` and `~/.theoria/store.json`
2. Starts the server on port `4000`
3. Opens the dashboard in your default browser

Subsequent runs reuse your saved config and start instantly.

### CLI reference

```bash
npx theoria-cli                     # Interactive setup + start
npx theoria-cli --port 8080         # Custom port
npx theoria-cli --reset             # Re-run first-time setup
npx theoria-cli agent \             # Launch the Go agent
  --url http://<host>:4000 \
  --key <api-key> \
  --id <server-id>
```

Copy your API key from the dashboard's **Settings** page and you're ready to connect agents.

## Deploying Agents

Theoria ships with a **Go agent** — a single static binary with no runtime dependencies on the target machine.

### Option A — via the CLI (uses bundled binary)

```bash
npx theoria-cli agent \
  --url http://<theoria-host>:4000 \
  --key <api-key-from-settings> \
  --id my-server
```

### Option B — standalone binary

```bash
cd agent
go build -o theoria-agent ./cmd/agent
./theoria-agent --url http://host:4000 --key <key> --id my-server
```

### Option C — cross-compile and deploy

```bash
# Linux amd64
GOOS=linux GOARCH=amd64 go build -o theoria-agent-linux-amd64 ./cmd/agent

# Linux arm64 (e.g. Raspberry Pi, AWS Graviton)
GOOS=linux GOARCH=arm64 go build -o theoria-agent-linux-arm64 ./cmd/agent

# Copy + run as a systemd service
scp theoria-agent-linux-amd64 user@server:/usr/local/bin/theoria-agent
```

### Behaviour

- Collects CPU, memory, disk, network, and load averages every 5 seconds
- Posts `/metrics` with a Bearer token
- Exponential backoff on failure, capped at 30 minutes between attempts
- ~5 MB resident memory (vs 30-50 MB for a Node.js agent)

## Docker Deployment

```bash
docker compose up -d
```

Dashboard available at `http://localhost:4000`.

See [docker-compose.yml](docker-compose.yml) for the full configuration.

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                  Theoria Dashboard                       │
│    Vite · React 19 · Tailwind · Recharts                  │
│    Zustand (state) · TanStack Query (server cache)        │
│    Socket.IO client for real-time updates                 │
├───────────────────────────────────────────────────────────┤
│                   Theoria Server                         │
│    Express 5 · Socket.IO 4 · Alert Engine                 │
│    In-memory store · JSON persistence (~/.theoria/)      │
│    Port 4000 — API + static client + WebSocket            │
└───────────────────────────────────────────────────────────┘
        ▲              ▲              ▲
        │   HTTPS      │   HTTPS      │   HTTPS
        │   Bearer     │   Bearer     │   Bearer
   ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
   │ Agent 1 │    │ Agent 2 │    │ Agent N │
   │  (Go)   │    │  (Go)   │    │  (Go)   │
   └─────────┘    └─────────┘    └─────────┘
```

**Data flow**

1. Agent collects OS-level metrics via platform-specific collectors (`/proc/stat` on Linux, `top -l 1` on macOS).
2. Agent posts `POST /metrics` with a Bearer token every 5 seconds.
3. Server upserts server status, appends to the metric ring buffer, and evaluates alert rules.
4. Server broadcasts metrics and alerts via Socket.IO.
5. Dashboard subscribes to its per-server channel and renders charts.

**Design choices**

- **No external database.** Users, servers, alert rules, and alert history persist to a debounced JSON snapshot in `~/.theoria/store.json`. Metric time-series lives in memory (ring buffer, 100k points per server, 7-day TTL).
- **Single process, single port.** The Express server also serves the built React app, so there's one port to expose.
- **Bearer auth for agents.** Dashboard is single-user (no login) — the threat model is that the dashboard and agents run inside a trusted network.
- **Platform-tagged collectors.** The Go agent uses `cpu_linux.go`, `cpu_darwin.go`, etc. under Go build tags for zero-overhead platform dispatch.

## Configuration

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4000` | Server port |
| `CLIENT_BUILD_PATH` | `client/build` | Override path to the built React app |
| `VITE_API_URL` | _(empty)_ | Set for a separate Vite dev server |
| `API_URL` | — | Agent target URL |
| `API_KEY` | — | Agent Bearer token |
| `SERVER_ID` | — | Agent's server identifier |
| `INTERVAL_MS` | `5000` | Agent collection interval |

Runtime data lives under `~/.theoria/`:

- `config.json` — port, API key, setup state
- `store.json` — persisted users, servers, alert rules, alert history

## API Reference

All endpoints are served from the main port.

### Agent ingestion

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/metrics` | Bearer API key | Agent metric ingestion |

### Dashboard API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/auth/me` | Current user + API key |
| `POST` | `/api/auth/regenerate-key` | Rotate API key |
| `GET` | `/api/servers` | List all servers |
| `GET` | `/api/servers/:id/metrics` | Historical metrics (`?timeRange=5m\|1h\|1d\|7d`) |
| `GET`, `POST`, `DELETE` | `/api/alerts/rules` | Alert rule CRUD |
| `GET` | `/api/alerts/history` | Alert history timeline |
| `GET` | `/api/http-checks` | List HTTP uptime checks |
| `GET` | `/api/docker/:serverId` | Docker containers on a server |
| `GET` | `/api/pipelines` | CI/CD pipeline history |
| `GET` | `/api/status-page/public` | Public status page data |
| `GET` | `/health` | Health probe |

### Webhook receiver

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/pipelines/webhook` | Bearer API key | CI/CD webhook ingestion (provider auto-detected from payload: GitHub Actions, GitLab CI, Jenkins, Bitbucket) |

## Repository Layout

```
monitoring-tool/
├── bin/theoria.js        CLI entry (npx theoria-cli)
├── server/
│   ├── src/               Express 5 runtime server (production path)
│   └── src-new/           Fastify 5 + TypeScript migration target
├── client/                Vite + React 19 + Tailwind dashboard
├── agent/                 Go 1.25 agent (cmd/agent, internal/collector)
├── landing/               Vite + React marketing page
├── Dockerfile
├── docker-compose.yml
└── package.json           npm package manifest (theoria-cli)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| CLI | Node.js (standard library only) |
| Server (runtime) | Express 5, Socket.IO 4, CommonJS |
| Server (in-migration) | Fastify 5, TypeScript (ESM), Vitest — in `server/src-new/` |
| Data store | In-memory arrays with debounced JSON snapshot |
| Frontend | Vite 8, React 19, Tailwind CSS 3, Recharts, Zustand, TanStack Query, Socket.IO client |
| Agent | Go 1.25, platform-tagged collectors, single static binary |
| Landing site | Vite, React 19, Tailwind CSS 4, Framer Motion |
| Container image | Multi-stage Dockerfile, distroless-friendly |

## Development

### Setup

```bash
git clone https://github.com/Abhra0404/Monitoring-tool.git
cd Monitoring-tool
npm install           # root CLI deps
cd server && npm install && cd ..
cd client && npm install --legacy-peer-deps && cd ..
```

### Common scripts

```bash
# Run the production server (Express)
cd server && npm start

# Run the Fastify/TypeScript server (migration target)
cd server && npm run dev

# Run the client in dev mode (HMR, proxies to server)
cd client && npm start

# Build the client for production
npm run build:client

# Type-check the TypeScript server
cd server && npm run typecheck

# Build the Go agent
cd agent && go build -o theoria-agent ./cmd/agent
```

### Running everything locally

```bash
# Terminal 1 — server
cd server && npm start

# Terminal 2 — client dev server
cd client && npm start

# Terminal 3 — agent pointed at local server
./agent/theoria-agent --url http://localhost:4000 --key <key> --id dev
```

## Testing

```bash
# Server tests (Vitest)
cd server && npm test

# Go agent tests
cd agent && go test ./...
```

Current coverage:

- **Server (Vitest):** alert engine threshold/duration logic, pipeline payload normalizers (GitHub, GitLab, Jenkins, Bitbucket), config loading
- **Agent (Go):** platform collectors, metric aggregation, backoff timing

## Security

- **Agent authentication** — all `/metrics` requests require a Bearer API key. Rotate keys from the Settings page.
- **Dashboard auth model** — single-user system (no login). Deploy behind a VPN, SSH tunnel, or reverse proxy with authentication if exposed to the internet.
- **Rate limiting** — per-API-key rate limiter on the `/metrics` ingestion endpoint (10 requests / second).
- **Input validation** — agent payloads are validated server-side before store writes.
- **No secrets in logs** — API keys are never logged.
- **Recommended deployment** — put Theoria behind [Caddy](https://caddyserver.com/) or Nginx with TLS termination.

Found a vulnerability? Open a private security advisory on GitHub rather than a public issue.

## Roadmap

Theoria is actively migrating toward a production-grade platform. High-level plan:

| Phase | Focus | Status |
|-------|-------|--------|
| **Foundation** | Fastify + TypeScript server, Vite + Zustand + TanStack Query client, Go agent, Vitest | ✅ In progress — `server/src-new/` typechecks, 19 tests pass, Go agent ships |
| **Database** | TimescaleDB + Drizzle ORM, dual-mode (in-memory fallback preserved) | 🚧 Next |
| **Unified monitor** | TCP / Ping / DNS / heartbeat monitors, 5 new notification providers (Discord, Telegram, Teams, PagerDuty, generic webhook), token-based onboarding | ❌ Planned |
| **Smart monitor** | Statistical anomaly detection, unified event timeline, incident management, 90-day uptime history, embeddable status badges | ❌ Planned |
| **Beautiful monitor** | Live topology map, command palette (⌘K), mobile-responsive redesign, plugin system | ❌ Planned |
| **Platform** | Go agent plugin API, OpenTelemetry export, public REST API | ❌ Planned |
| **Production hardening** | Redis pub/sub, Pino structured logging, Prometheus `/metrics`, Sentry, Helm chart, GitHub Actions CI | ❌ Planned |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up a development
environment, run tests, and submit pull requests.

## License

Released under the [ISC License](LICENSE) © Abhra0404
</div>
<div align="center">
<sub>Built for operators who want their monitoring back under one roof.</sub>
</div>

