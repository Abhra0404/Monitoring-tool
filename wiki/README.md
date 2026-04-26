# Theoria Wiki

The official documentation for **Theoria** — a self-hosted, open-source observability platform for servers, containers, services, and CI/CD pipelines.

> **Looking for the marketing site?** See [`landing/`](../landing/). **Looking for source-level guidance?** See [`CLAUDE.md`](../CLAUDE.md).

---

## What is Theoria?

Theoria is a single-binary observability stack that you self-host. It collects host metrics from a tiny Go agent, runs synthetic checks (HTTP / TCP / Ping / DNS), receives heartbeats from cron jobs, exposes a real-time dashboard, evaluates alerts, and can publish a public status page — all from one Fastify process backed by Postgres + Redis (or a single JSON file in dev).

```
┌─────────┐   POST /metrics        ┌────────────────────┐
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
                                  └─────────────────────┘
```

---

## Documentation Map

### 🚀 Getting Started
- [Introduction](getting-started/introduction.md) — what Theoria does and when to use it
- [Installation](getting-started/installation.md) — install via npx, Docker, or Helm
- [Quickstart](getting-started/quickstart.md) — first server monitored in 5 minutes
- [Configuration](getting-started/configuration.md) — environment variables and config file

### 🏗 Architecture
- [Overview](architecture/overview.md) — high-level system diagram
- [Components](architecture/components.md) — server, client, agent, plugins
- [Data Model](architecture/data-model.md) — every database table and relationship

### 🛰 Agent
- [Agent Overview](agent/overview.md) — what it collects and how
- [Installing the Agent](agent/installation.md) — Linux, macOS, Windows, Docker
- [Agent Reference](agent/reference.md) — flags, env vars, payload schema

### 🔌 API
- [REST Reference](api/rest-reference.md) — every endpoint with auth and payloads
- [Authentication](api/authentication.md) — JWT, refresh tokens, API keys
- [WebSockets](api/websockets.md) — Socket.IO event taxonomy

### 📊 Monitoring
- [Metrics & Time-Series](monitoring/metrics.md)
- [Alerts](monitoring/alerts.md) — rules, severities, breach state
- [Synthetic Checks](monitoring/synthetic-checks.md) — HTTP / TCP / Ping / DNS
- [Heartbeats](monitoring/heartbeats.md) — cron-job monitoring
- [Incidents & Status Page](monitoring/incidents-and-status-page.md)
- [Notifications](monitoring/notifications.md) — Slack, Email, Discord, PagerDuty, etc.

### 🔗 Integrations
- [OpenTelemetry (OTLP)](integrations/opentelemetry.md)
- [CI/CD Pipelines](integrations/pipelines.md) — GitHub Actions, GitLab, Jenkins, Bitbucket
- [Docker Containers](integrations/docker.md)

### 🧩 Plugins
- [Plugin Overview](plugins/overview.md)
- [Authoring Guide](plugins/authoring.md)
- [Manifest Reference](plugins/manifest-reference.md)

### 🚢 Deployment
- [Docker & Docker Compose](deployment/docker.md)
- [Kubernetes (Helm)](deployment/kubernetes-helm.md)
- [Reverse Proxy & TLS](deployment/reverse-proxy.md)
- [High Availability](deployment/high-availability.md)

### 🛠 Operations
- [Runbook](operations/runbook.md) — health checks, restarts, key rotation
- [Backup & Restore](operations/backup-restore.md)
- [Observability of Theoria itself](operations/observability.md)
- [Upgrades](operations/upgrades.md)

### 🔒 Security
- [Security Overview](security/overview.md)
- [Production Hardening](security/hardening.md)

### 📚 Reference
- [CLI Reference](cli-reference.md)
- [Troubleshooting](troubleshooting.md)
- [FAQ](faq.md)
- [Glossary](glossary.md)

---

## License

Theoria is distributed under the [Apache License 2.0](../LICENSE).

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [SECURITY.md](../SECURITY.md). Issues and PRs welcome at the project repository.
