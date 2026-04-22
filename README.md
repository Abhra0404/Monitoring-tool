# Theoria

Theoria is a self-hosted observability platform that combines server metrics, synthetic uptime checks, Docker insights, CI/CD webhooks, anomaly detection, incident management, and a public status page in a single Fastify process.

It has a friendly web interface, zero-config single-node setup, and scales horizontally with optional TimescaleDB and Redis. Distributed as an npm CLI (`theoria-cli`) and a static Go agent.

[![npm](https://img.shields.io/npm/v/theoria-cli?color=2ea44f)](https://www.npmjs.com/package/theoria-cli)
[![license](https://img.shields.io/badge/license-ISC-%239944ee)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](#getting-started)
[![go](https://img.shields.io/badge/go-1.25-00ADD8)](agent/go.mod)
[![helm](https://img.shields.io/badge/helm-chart-0F1689)](charts/theoria/Chart.yaml)

## Features

- **Zero-config**: `npx theoria-cli` creates the config, generates an admin password, and opens the dashboard.
- **Real-time fleet**: CPU / memory / disk / network / load streamed every 5 s over Socket.IO, with a live topology map and a `⌘K` command palette.
- **Synthetic checks**: HTTP (with TLS expiry), TCP, Ping, DNS, and Heartbeat cron monitors.
- **Alerting**: Threshold + duration rules and online Welford anomaly detection, with incident state-machine, timeline, and seven notification providers (Slack, Email, Discord, Telegram, Teams, PagerDuty, generic webhook).
- **Status page**: 90-day uptime bars, custom domain via Caddy on-demand TLS, embeddable SVG badges, RSS feed.
- **CI/CD**: Auto-detects GitHub Actions, GitLab CI, Jenkins, and Bitbucket webhook payloads.
- **Extensible**: `worker_threads`-sandboxed plugin system with first-party plugins for Redis, nginx, PostgreSQL, MySQL, MongoDB.
- **Standards-friendly**: OpenTelemetry OTLP ingest, auto-generated OpenAPI 3 docs, Prometheus self-metrics.
- **Horizontally scalable**: Optional TimescaleDB + Redis (Socket.IO adapter, shared rate-limit, replicated lockout).
- **Secure by default**: JWT + bcrypt, account lockout, audit log, Helmet CSP, CORS pin, non-root Docker + Helm.

## Architecture

Theoria has three components:

- **Server** — A Fastify 5 + TypeScript process that serves the API, WebSocket stream, React dashboard, public status page, and OpenAPI docs. Stores state in-memory with a JSON snapshot at `~/.theoria/store.json`, or in **TimescaleDB** when `DATABASE_URL` is set.
- **Agent** — A single static Go binary that collects host and Docker metrics every 5 s and POSTs to the server over HTTPS. Cross-compiles to linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, and windows/amd64.
- **Dashboard** — A Vite + React 19 + Tailwind app served by the same port as the API. Real-time via Socket.IO, with TanStack Query for REST.

Request lifecycle and HA topology in [docs/architecture.md](docs/architecture.md).

## Getting started

```bash
npx theoria-cli
```

On first run, Theoria creates `~/.theoria/`, generates an admin password, and starts on port `4000`. Install the agent on any host you want to monitor via **Settings → Add agent**, which issues a single-use onboarding token:

```bash
npx theoria-cli agent --token <jwt>
```

For Docker Compose, Helm, Caddy, and agent installers, see the [deployment guide](deploy/README.md) and the [runbook](docs/runbook.md).

## Supported metrics

- **CPU** — Per-core and aggregate; host system.
- **Memory** — Host system, including swap.
- **Disk usage and I/O** — Multiple partitions and devices.
- **Network** — Host system and per-container.
- **Load average** — 1 / 5 / 15 minute.
- **Containers** — Status, CPU, memory, I/O, network for every running Docker container.
- **Synthetic checks** — Latency, status-code, TLS expiry days remaining, DNS resolution time.
- **OpenTelemetry OTLP** — External gauges, sums, and histograms pushed to `/v1/metrics`.

## Configuration

All env vars are validated by a Zod schema in [server/src-new/config.ts](server/src-new/config.ts). The most common ones:

- `DATABASE_URL` — Postgres / TimescaleDB connection string. Unset ⇒ in-memory mode.
- `REDIS_URL` — Enables the Socket.IO adapter, shared rate-limit, and replicated lockout.
- `JWT_SECRET` — Required in production (≥16 chars).
- `CORS_ORIGINS` — Comma-separated list; `*` is refused in production.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — Bootstrap admin on first boot.
- `SENTRY_DSN` — Opt-in error reporting.

## Documentation

- [docs/architecture.md](docs/architecture.md) — Topology, request lifecycle, single-node vs HA.
- [docs/runbook.md](docs/runbook.md) — Probes, rolling restart, JWT rotation, backups, troubleshooting.
- [docs/plugin-authoring.md](docs/plugin-authoring.md) — Manifest, sandbox APIs, lifecycle events.
- [deploy/agent/README.md](deploy/agent/README.md) — Agent install, upgrade, uninstall for every platform.
- [SECURITY.md](SECURITY.md) — Disclosure policy and hardening summary.
- [CONTRIBUTING.md](CONTRIBUTING.md) — Dev setup and PR guidelines.

API reference is generated at runtime and served at `/api/docs` (Swagger UI) and `/api/docs.json` (OpenAPI 3.0).

## Help and discussion

Please search existing issues and discussions before opening a new one.

- Bug reports and feature requests: [GitHub issues](https://github.com/Abhra0404/Monitoring-tool/issues).
- Support and general discussion: [GitHub discussions](https://github.com/Abhra0404/Monitoring-tool/discussions).

## License

Theoria is licensed under the ISC License. See the [LICENSE](LICENSE) file for more details.
