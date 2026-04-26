# Glossary

Terms used throughout Theoria's documentation.

## A

**Agent**
The small Go binary deployed on monitored hosts. Collects host, container, and (optionally) OTLP metrics every `INTERVAL_MS` and ships them to the Theoria server. See [Agent Overview](agent/overview.md).

**Alert rule**
A user-defined condition (`metric > threshold for duration`) that, when satisfied, transitions to `firing` and triggers notifications. See [Alerts](monitoring/alerts.md).

**Alert history**
Persisted record of every alert state transition (`firing`, `resolved`, `acknowledged`). Used for post-incident review and SLO calculations.

**API key**
A 256-bit secret used by an agent to authenticate to `POST /metrics`. Per-server, prefixed `tha_`, stored as an `argon2id` hash. Revocable via dashboard or API.

**`argon2id`**
Memory-hard password-hashing function used for API key storage.

**Audit log**
Append-only record of administrative actions (user create/delete, key regeneration, plugin install, rule change). Stored in the `audit_events` table.

## B

**Breach state**
Internal alert-engine state that tracks how long a rule has been violating its threshold. Stored in Redis (HA) or in-process memory (single replica). The state machine: `ok → pending → firing → resolved → ok`.

## C

**Capability**
A specific permission granted to a plugin (e.g. `http.outbound`, `kv.write`). Plugins must declare every capability they use in `theoria-plugin.json`. The plugin host enforces the allowlist at runtime. See [Plugin Overview](plugins/overview.md).

**Continuous aggregate**
A TimescaleDB feature that pre-computes rollups (e.g. 5-minute averages) of a hypertable. Theoria uses these to make long-range dashboard queries fast.

**Correlation ID**
A UUID attached to every request for cross-cutting trace identification. Echoed back in the `X-Correlation-Id` response header and included in every log line.

## D

**Drizzle**
The TypeScript ORM Theoria uses for Postgres. Migration files live in `server/src-new/db/migrations/`.

## E

**Enricher plugin**
A plugin that subscribes to `metric.ingested` and can derive new metrics from incoming data without modifying the original.

## H

**Heartbeat**
A monitoring primitive where Theoria expects a periodic ping (HTTP, exec, etc.). Missing pings transition the heartbeat to `failed` and may trigger alerts. See [Heartbeats](monitoring/heartbeats.md).

**Hypertable**
A TimescaleDB abstraction: a regular table partitioned automatically by a time column. Used by `metrics`, `http_check_results`, and `docker_containers`.

## I

**Incident**
A user-curated record on the [status page](monitoring/incidents-and-status-page.md). Tracks impact, affected components, and updates. Independent of alert history.

**Instance (plugin)**
A bound configuration of an installed plugin. One plugin package can have many instances (e.g. one MongoDB plugin instance per database).

## J

**JWT**
JSON Web Token. Theoria signs HS256 access tokens valid for 15 min and refresh tokens valid for 7 days, both stored in `httpOnly` cookies.

## K

**KV (Key-value store)**
A per-plugin-instance namespace for state, accessible via the `kv.read/write/delete` capabilities. Backed by Postgres.

## M

**Metric**
A `(name, value, labels, timestamp, serverId)` tuple. Stored in the `metrics` hypertable.

**Maintenance mode**
A server-wide flag (`MAINTENANCE_MODE=true`) that returns 503 from API endpoints and pauses alert evaluation while still accepting agent ingestion. Used during long migrations.

## O

**OpenTelemetry / OTLP**
The CNCF observability framework. Theoria's agent can receive OTLP metrics on port 4318 when `--otel` is set, and the server can emit OTLP traces. See [OpenTelemetry](integrations/opentelemetry.md).

## P

**Pino**
The JSON-structured logger Theoria uses.

**Plugin**
Code that extends Theoria with new check types, metrics, or alert sinks. Runs in a sandboxed `worker_thread`. See [Plugins](plugins/overview.md).

**Pipeline**
A configurable transformation applied to metrics in flight (filtering, relabeling, sampling). See [Pipelines](integrations/pipelines.md).

**PodDisruptionBudget (PDB)**
A Kubernetes object that limits how many pods of a deployment can be voluntarily disrupted at once. Theoria's Helm chart sets `minAvailable: 1`.

## R

**Rate limit**
Per-IP or per-token request quota enforced by the server. Defaults differ per endpoint group; backed by Redis when available.

**Refresh token**
The longer-lived JWT (7 day TTL) used to obtain a new access token. Rotated on every use; storing them is the responsibility of the browser via `httpOnly` cookies.

## S

**Server (record)**
A tracked host or container in Theoria. Each server has an ID, an API key, ownership info, and an associated metric stream.

**Server-check plugin**
A plugin invoked on a fixed interval (`intervalSeconds`) to probe an external system (database, queue, web service).

**Sink plugin**
A plugin that subscribes to `alert.fired` / `alert.resolved` and forwards events to an external system (chat, ticketing, etc.).

**Socket.IO**
The WebSocket library Theoria uses for live dashboard updates. Multi-replica deployments use the Redis adapter for cross-pod broadcast.

**Status page**
A public-facing page that surfaces uptime and incident state for selected components. See [Status Page](monitoring/incidents-and-status-page.md).

**Synthetic check**
An active probe (HTTP, TCP, DNS, ICMP) executed on a schedule to measure availability and latency from outside the monitored system. See [Synthetic Checks](monitoring/synthetic-checks.md).

## T

**TimescaleDB**
A Postgres extension that provides automatic time-based partitioning, columnar compression, and continuous aggregates. Theoria's metric hypertables depend on it.

**Tick**
One execution of a server-check plugin's handler, occurring every `intervalSeconds`.

## W

**Worker thread**
A Node.js mechanism for running JavaScript on a separate thread with isolated memory. Theoria's plugin host uses `worker_threads` to sandbox plugin code.

## Z

**Zod**
The TypeScript schema validation library Theoria uses to validate every API request body.
