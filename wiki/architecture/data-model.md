# Data Model

This page is the canonical reference for every Theoria table, its columns, and its relationships.

> **Where this lives:** schemas are defined with [Drizzle ORM](https://orm.drizzle.team/) in [`server/src-new/db/schema.ts`](../../server/src-new/db/schema.ts). Migrations are tracked under `server/src-new/db/migrations/`.

## Conventions

- All primary keys are UUID v7 unless otherwise noted.
- All `*_at` columns are `timestamp with time zone`.
- All foreign keys cascade on delete unless noted.
- TimescaleDB hypertables are partitioned by the `time` column.

---

## Identity & access

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `email` | varchar(255) | Unique, indexed |
| `password_hash` | varchar(255) | bcrypt, cost 12 |
| `api_key` | varchar(128) | Unique, indexed; rotated via `/api/auth/regenerate-key` |
| `role` | varchar(32) | Default `user`. Reserved for future RBAC |
| `is_system` | boolean | Bootstrap user used by the CLI in single-node mode |
| `created_at`, `updated_at` | timestamp | |

### `refresh_tokens` *(internal)*

Stores hashed refresh tokens for rotation. Old tokens are marked revoked atomically when refreshed.

---

## Inventory

### `servers`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users.id`, cascade |
| `server_id` | varchar(128) | Agent-supplied identifier (default: hostname) |
| `name` | varchar(255) | Display name |
| `hostname` | varchar(255) | Reported by agent |
| `platform` | varchar(64) | `linux` · `darwin` · `windows` |
| `arch` | varchar(32) | `amd64` · `arm64` |
| `cpu_count` | integer | |
| `status` | varchar(32) | `online` · `offline`. Marked offline if `last_seen` > 60 s |
| `last_seen` | timestamp | Updated on every ingest |

**Unique index:** `(user_id, server_id)` — one server per agent per user.

---

## Alerts

### `alert_rules`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users.id` |
| `name` | varchar(255) | |
| `metric_name` | varchar(128) | e.g. `cpu_usage`, `memory_usage_percent` |
| `labels` | jsonb | Optional filter (`{"host":"web-1"}`) |
| `operator` | varchar(8) | `<` `>` `<=` `>=` `==` `!=` |
| `threshold` | double precision | |
| `duration_minutes` | integer | Must breach for this long before firing (default 0) |
| `severity` | varchar(16) | `info` · `warning` · `error` · `critical` |
| `is_active` | boolean | Toggle without deleting |

**Index:** `(user_id, metric_name)` for fast evaluation.

### `alert_history`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | |
| `rule_id` | uuid | FK → `alert_rules.id`, cascade |
| `rule_name`, `metric_name` | varchar | Snapshot at firing time |
| `labels` | jsonb | |
| `operator`, `threshold`, `actual_value` | | Conditions that triggered |
| `severity` | varchar(16) | |
| `status` | varchar(16) | `firing` · `resolved` |
| `message` | text | Human-readable |
| `fired_at`, `resolved_at` | timestamp | |

Auto-purged after 30 days.

---

## Synthetic checks

All four check tables share the same skeleton; only the protocol-specific fields differ.

### `http_checks`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id`, `name`, `url` | | |
| `interval_seconds` | integer | Default 60 |
| `expected_status` | integer | Default 200 |
| `timeout_ms` | integer | Default 10000 |
| `is_active`, `status` | | |
| `last_checked_at` | timestamp | |
| `last_response_time` | integer | ms |
| `last_status_code` | integer | |
| `ssl_expiry` | timestamp | Set when URL is HTTPS |
| `uptime_percent` | double precision | Rolling 30-day |

### `tcp_checks`

`host`, `port`, `interval_seconds`, `timeout_ms`, `is_active`, `status`.

### `ping_checks`

`host` (validated against `^[a-zA-Z0-9._-]+$`), `interval_seconds`, `is_active`, `status`.

### `dns_checks`

`domain`, `record_type` (`A` · `AAAA` · `CNAME` · `MX` · `TXT` · `NS` · `SOA`), `expected` (optional value to assert), `interval_seconds`, `is_active`, `status`.

### `http_check_results` *(hypertable)*

Per-attempt result row.

| Column | Type |
|---|---|
| `time` | timestamp with TZ |
| `check_id` | uuid |
| `user_id` | uuid |
| `status_code` | integer |
| `response_time` | integer (ms) |
| `status` | varchar(16) |
| `ssl_days_remaining` | integer |
| `error` | text |

---

## Heartbeats (cron monitors)

### `heartbeat_monitors`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | |
| `name` | varchar(255) | |
| `slug` | varchar(64) | Globally unique. Pattern `^[a-z0-9][a-z0-9-]{1,62}$` |
| `expected_every_seconds` | integer | Expected ping cadence |
| `grace_period_seconds` | integer | Default 30 |
| `is_active`, `status` | | |
| `last_ping_at` | timestamp | |

The status flips to `late` once `now > last_ping_at + expected + grace`.

---

## Notifications

### `notification_channels`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | |
| `type` | varchar(32) | `slack` · `email` · `discord` · `telegram` · `webhook` · `teams` · `pagerduty` |
| `name` | varchar(255) | |
| `config` | jsonb | Type-specific (`webhookUrl`, `smtpHost`, `routingKey`, etc.) |
| `is_active` | boolean | |

`smtpPass` is **redacted** as `••••••••` in API responses.

---

## Incidents & status page

### `incidents`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | |
| `title` | varchar(255) | |
| `message` | text | |
| `status` | varchar(32) | `investigating` → `identified` → `monitoring` → `resolved` |
| `severity` | varchar(16) | `minor` · `major` · `critical` · `maintenance` |
| `services` | jsonb | Array of affected service names |

### `incident_updates`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `incident_id` | uuid | FK → `incidents.id`, cascade |
| `message` | text | |
| `status` | varchar(32) | New status at this point in time |
| `created_at` | timestamp | |

### `status_page_config`

Singleton per user.

| Column | Type |
|---|---|
| `user_id` | uuid (PK) |
| `title`, `description` | varchar / text |
| `is_public` | boolean |
| `custom_domain` | varchar(255) |
| `custom_services` | jsonb (array of `{name, status, description}`) |

---

## CI/CD

### `pipelines`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | |
| `source` | varchar(32) | `github` · `gitlab` · `jenkins` · `bitbucket` |
| `repo`, `branch`, `pipeline_name` | | |
| `run_id`, `run_number` | | |
| `status` | varchar(32) | `running` · `success` · `failed` · `cancelled` |
| `triggered_by`, `commit_sha`, `commit_message`, `url` | | |
| `started_at`, `finished_at` | timestamp | |
| `duration_ms` | bigint | |
| `stages` | jsonb | Array of step results |

**Unique index:** `(user_id, source, run_id)`.

---

## Time-series hypertables

### `metrics`

| Column | Type | Notes |
|---|---|---|
| `time` | timestamp with TZ | NOT NULL, partition key |
| `user_id`, `server_id` | | |
| `name` | varchar(128) | Metric name (`cpu_usage`, `disk_usage_percent`, …) |
| `value` | double precision | |
| `labels` | jsonb | Free-form (`{"mount":"/data"}`) |

**Indexes:** `(user_id, server_id, time DESC)`, `(user_id, server_id, name, time DESC)`.

### `docker_containers`

Per-snapshot rows from agents with `--docker` enabled.

| Column |
|---|
| `time`, `user_id`, `server_id`, `container_id`, `name`, `image`, `status`, `state`, `cpu_percent`, `mem_usage`, `mem_limit`, `mem_percent`, `net_rx`, `net_tx`, `restarts` |

---

## Retention

| Table | Retention | Compression |
|---|---|---|
| `metrics` | 7 days (configurable) | After 24 h |
| `http_check_results` | 30 days | After 7 d |
| `docker_containers` | 7 days | After 24 h |
| `alert_history` | 30 days | n/a |
| All relational tables | Forever (until deleted via API) | n/a |

The retention worker runs once per hour. When `DATABASE_URL` is unset, retention is enforced by capping arrays to fixed sizes (100 000 metric points per server).
