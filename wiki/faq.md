# Frequently Asked Questions

## General

### What is Theoria?

A self-hosted observability platform that combines host/container metrics, synthetic checks, heartbeats, alerting, and a status page in one binary you control. See [Introduction](getting-started/introduction.md).

### Is there a SaaS edition?

No. Theoria is intentionally self-hosted: your data stays in your infrastructure. We may offer a managed edition in the future, but the open-source product will always be a complete, single-binary deployment.

### What's the licence?

Apache 2.0. See [`LICENSE`](../LICENSE).

### How does Theoria compare to Datadog / New Relic?

Theoria targets the 80 % of monitoring use cases — metrics, alerts, uptime checks — without the data-egress cost or vendor lock-in. It deliberately doesn't try to replace APM, log aggregation, or distributed tracing platforms (though OTLP ingestion lets you bridge to those).

### How does Theoria compare to Prometheus / Grafana?

Prometheus + Grafana + Alertmanager is more flexible and more battle-tested for huge fleets. Theoria is simpler to deploy (one binary, one database, no scrape configuration), opinionated about alert delivery, and ships a usable UI out of the box. Use Theoria when you want monitoring that "just works"; use Prometheus when you need PromQL and a metrics ecosystem.

### How does Theoria compare to Zabbix / Nagios?

Theoria is API-first, container-friendly, and built on a modern stack. The classic tools have larger plugin ecosystems and are well-suited to bare-metal datacenter operations.

## Architecture

### Why an agent and not Prometheus exporters?

A single binary is easier to install across heterogeneous environments (Linux, macOS, Windows, ARM, x86) than the N+1 exporters typical of a Prometheus deployment. The agent also handles outbound auth, buffering, and reconnection — concerns the Prometheus model pushes onto each exporter.

That said, **Theoria can ingest OTLP**, so you can keep using your existing exporters or OpenTelemetry collectors and route them to Theoria.

### Can I run Theoria without Postgres?

Yes — for evaluation. With `DATABASE_URL` unset, Theoria uses an in-memory store with a JSON snapshot at `~/.theoria/store.json`. Metric history is **not** persisted in this mode. Use Postgres for any production use.

### Can I run Theoria without Redis?

Yes — for single-replica deployments. Redis is required only if you run multiple application replicas (HA). Without it, you get per-replica Socket.IO broadcast and per-replica breach state, which can cause duplicate alerts.

### Is multi-tenancy supported?

Each user has their own servers, alert rules, plugin instances, and history. There's no shared "admin" view of other users' data. This is enough for small teams; for true multi-tenant SaaS-style deployments, additional work is needed (organisations, role-based access, audit log per tenant).

### Does Theoria scale horizontally?

Yes. The application tier is stateless; all shared state lives in Postgres + Redis. See [High Availability](deployment/high-availability.md).

## Operations

### How much does it cost to run?

A single-replica deployment with Postgres fits comfortably on a 2 vCPU / 4 GiB VM, plus storage proportional to your retention window. For 100 servers reporting every 5 s with 30-day retention, expect ~10 GiB of compressed metric data.

### How long are metrics retained?

Default 30 days, with TimescaleDB compression after 24 h. Configurable via `METRIC_RETENTION_DAYS`. Alert history defaults to 90 days; audit log to 365 days.

### Can I export my data?

Yes. Postgres is open and accessible. You can also use the API for programmatic export (see [REST Reference](api/rest-reference.md)).

### How do I migrate to a new host?

See [Backup & Restore](operations/backup-restore.md) → "Migrating between hosts".

### What happens during a network partition?

Agents buffer metrics in memory (default 10 MB) and replay on reconnect. Alerts may be delayed by the buffer flush time but won't be lost. The dashboard reconnects via Socket.IO with exponential backoff.

## Agents

### Which platforms does the agent support?

Linux (amd64, arm64), macOS (amd64, arm64), Windows (amd64). The agent is a single static Go binary.

### Can I run the agent inside a container the agent is monitoring?

Yes. The agent reads host metrics through `/proc` and `/sys`. When you run it in a container with `--pid=host --network=host` and the relevant volume mounts, it sees the host accurately. See [Agent Installation](agent/installation.md).

### Does the agent expose ports?

Only when `--otel` is set (default port 4318 for OTLP HTTP). Otherwise the agent is purely outbound — it dials the Theoria server.

### How much overhead does the agent add?

Typical: 5–20 MiB resident memory and < 1 % CPU on a modern host. It rises with `--docker` proportional to the number of running containers.

### Can the agent run behind a corporate proxy?

Yes. Set `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` environment variables.

## Plugins

### Are plugins safe?

Plugins run inside `worker_threads` with a capability allowlist that restricts filesystem, network, and process access. See [Plugin Overview](plugins/overview.md). Treat unknown community plugins as you would any third-party code: read the source.

### Can plugins access the database directly?

No. Plugins use the `kv` capability for per-instance state and `metrics.gauge` / `metrics.counter` to publish derived metrics. They cannot run arbitrary SQL.

### Can I write a plugin in something other than JavaScript?

Not directly. The host runs Node.js `worker_threads`. You can shell out from a JS plugin via the `http` capability to a sidecar service, but that defeats most of the sandboxing benefits.

## Security

### How are secrets stored?

`JWT_SECRET` and `DATABASE_URL` are read from environment variables; rotate them via your secrets manager. API keys are stored as `argon2id` hashes in Postgres. Plugin configs marked `format: password` are masked in API responses.

### Can I integrate SSO?

Native SSO (OIDC, SAML) is on the roadmap. Today, you can front Theoria with an authenticating proxy (oauth2-proxy, Authelia, Cloudflare Access) and trust the proxy's identity headers via `TRUSTED_PROXIES`.

### Is data encrypted at rest?

Theoria does not encrypt data at the application layer. Use Postgres with encrypted storage (TDE in managed offerings, LUKS on self-hosted disks) and encrypted backups.

### Has Theoria been audited?

Not formally. We welcome security research; see [SECURITY.md](../SECURITY.md) for the disclosure process.

## Roadmap

### What's next?

Public roadmap is at [`plans/remaining-work.md`](../plans/remaining-work.md). Highlights:

- Native SSO (OIDC + SAML)
- Plugin signing and a marketplace
- Container alerts as first-class rules
- Read-replica routing for heavy metric queries
- Mobile push notifications via the official iOS/Android apps

### How can I contribute?

See [`CONTRIBUTING.md`](../CONTRIBUTING.md). We welcome bug reports, plugins, doc improvements, and PRs.
