# Introduction

Theoria is a **self-hosted observability platform** that consolidates the four signals most teams need into one process:

| Signal | What Theoria gives you |
|---|---|
| **Metrics** | CPU / memory / disk / network / load from a 5 MB Go agent, plus custom metrics via OpenTelemetry OTLP and plugins |
| **Synthetics** | HTTP, TCP, Ping, and DNS checks scheduled in-process |
| **Heartbeats** | Cron-job monitoring with grace periods (Healthchecks-style) |
| **Status & Incidents** | Public status page, RSS feed, SVG uptime badge, incident state machine |

It is designed to be **easy to run on a single VM** but to scale horizontally when you need it. There is no SaaS edition. There is no telemetry phoning home. Everything is Apache 2.0.

---

## Who Theoria is for

- Small teams who want Datadog / New Relic / Grafana-stack functionality without the bill or the operational footprint of running Prometheus + Alertmanager + Grafana + Loki + Tempo + a status page vendor.
- Solo developers monitoring side-projects who need 90% of the value at 0% of the cost.
- Platform teams inside larger organisations who need a turn-key internal monitoring service for non-critical workloads.
- Anyone who wants their monitoring stack on infrastructure they fully control.

## What Theoria is *not*

- A long-horizon analytics warehouse. Theoria targets weeks of high-resolution data, not years. Use ClickHouse / BigQuery downstream if you need that.
- A log-aggregation system. Send logs to Loki, OpenSearch, or your SIEM. Theoria correlates events, but it isn't a log store.
- An APM / tracing backend. OpenTelemetry traces are out of scope; metrics over OTLP are supported.

---

## How it is shipped

Theoria is published as a single npm package, `theoria-cli`. Running `npx theoria-cli` performs first-time setup, writes config to `~/.theoria/config.json`, and starts the Fastify server on port 4000. The server serves both the JSON API and the built React dashboard from the same process.

Production users typically replace the in-memory store with PostgreSQL (with the TimescaleDB extension) and add Redis for the Socket.IO adapter. See [High Availability](../deployment/high-availability.md).

## Tech stack at a glance

| Layer | Technology |
|---|---|
| Server | Fastify 5 · Socket.IO 4 · Drizzle ORM · TypeScript 5 · Zod |
| Storage | PostgreSQL + TimescaleDB (recommended), or in-memory + JSON file |
| Cache / pubsub | Redis (optional, required for HA) |
| Dashboard | React 19 · Vite · Tailwind CSS · TanStack Query · Zustand · Recharts |
| Agent | Go 1.25 (static binary, ~5 MB) |
| Plugins | Node.js worker_threads with capability sandbox |
| Distribution | npm (`theoria-cli`), Docker image, Helm chart, native installers (systemd / launchd / Windows Service) |

Continue with [Installation](installation.md).
