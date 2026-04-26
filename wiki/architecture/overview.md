# Architecture Overview

Theoria is built around a **single Fastify process** that owns ingestion, scheduling, alert evaluation, real-time fan-out, and serving the React dashboard. State lives in PostgreSQL (with the TimescaleDB extension for hypertables) and Redis is added for horizontally-scaled deployments.

## High-level diagram

```
                ┌──────────────────────────────┐
                │         React 19 SPA         │
                │  (served by the same server) │
                └──────────────┬───────────────┘
                       HTTPS · WebSocket
                              │
┌─────────────────────────────▼─────────────────────────────┐
│                    Fastify · Node.js                      │
│  ┌─────────────────┐  ┌────────────────┐  ┌────────────┐  │
│  │  REST API       │  │  Socket.IO     │  │ Scheduler  │  │
│  │  /api/* /v1/*   │  │  rooms = users │  │ HTTP, TCP, │  │
│  │  /metrics       │  │  events = …    │  │ Ping, DNS, │  │
│  └────────┬────────┘  └───────┬────────┘  │ Plugins    │  │
│           │                   │            └─────┬──────┘  │
│  ┌────────▼─────────┐ ┌───────▼──────┐ ┌────────▼──────┐  │
│  │  Alert Engine    │ │  Plugin Host │ │  Status Page  │  │
│  │  (breach state)  │ │  (workers)   │ │  Renderer     │  │
│  └────────┬─────────┘ └──────────────┘ └───────────────┘  │
└───────────┼───────────────────────────────────────────────┘
            │
   ┌────────┴────────┐                ┌──────────────────┐
   │ Drizzle ORM     │ ◀──────────────│ Redis (optional) │
   └────────┬────────┘                │  pub/sub · KV    │
            │                         └──────────────────┘
   ┌────────▼─────────────────────────┐
   │ PostgreSQL + TimescaleDB         │
   │  • relational tables             │
   │  • hypertables (metrics, results)│
   └──────────────────────────────────┘
            ▲
            │ POST /metrics  (Bearer API key)
            │
   ┌────────┴────────┐
   │ Theoria Agent   │  Go · static · ~5 MB
   │ (per host)      │  collects every 5s
   └─────────────────┘
```

## Responsibilities

| Component | Responsibility |
|---|---|
| **Fastify server** | HTTP API, scheduling, alert evaluation, plugin host, dashboard delivery, status page |
| **React SPA** | Dashboard UI, served as a static bundle from the same Express process |
| **Agent** | Collect host metrics every 5 s and POST them to `/metrics` |
| **PostgreSQL + Timescale** | Source of truth for users, servers, rules, history; hypertables for time-series |
| **Redis (optional)** | Socket.IO adapter for HA, distributed rate limit, lockout state |

## Two deployment modes

### Single-node (zero config)

- No external dependencies
- All state in-memory + JSON file at `~/.theoria/store.json`
- Suitable for ≤ 50 monitored hosts and a single operator
- Lost on crash if you don't enable backups

### High-availability

- ≥ 2 server replicas behind a load balancer
- PostgreSQL + TimescaleDB for durable state
- Redis for Socket.IO room replication and shared rate limit
- Recommended for production teams

See [High Availability](../deployment/high-availability.md) for a full topology.

## Hot path: metric ingestion

```
Agent ──POST /metrics──▶ Fastify
                             │ 1. validate API key (constant-time)
                             │ 2. upsert servers row (last_seen)
                             │ 3. INSERT metric data points (hypertable)
                             │ 4. evaluate alert rules (breach state Map)
                             │ 5. emit Socket.IO `metric:update`
                             │ 6. fire notifications if rules cross threshold
                             ▼
                         200 OK
```

Steps 2–6 run sequentially; step 5 fires before step 6 so the dashboard updates immediately. A single ingest call typically completes in 2–10 ms when Postgres is local.

## Real-time fan-out

The dashboard maintains **one** Socket.IO connection. Server-side rooms are keyed by `user:<id>` so each socket only receives the metrics, alerts, and incidents for the authenticated user. Events:

| Event | Payload | Fired when |
|---|---|---|
| `metric:update` | latest data point + server snapshot | Agent posts metrics |
| `alert:fired` | full alert record | Rule crosses threshold |
| `alert:resolved` | alert record + duration | Metric returns within bounds |
| `check:result` | check id + status + latency | Synthetic check completes |
| `incident:update` | incident + new update | Operator posts an update |

When Redis is configured, Socket.IO uses the official adapter so rooms span all replicas.

## Time-series storage

Metrics, HTTP results, and Docker container snapshots live in TimescaleDB hypertables. Each hypertable has a 7-day retention policy by default and is auto-compressed after 24 hours. Relational tables (users, servers, rules, history) live in regular Postgres tables.

When `DATABASE_URL` is unset, the entire data layer collapses into JavaScript arrays in `server/src-new/store/`. The hypertables are simulated by capped ring buffers (100 000 points per server, 7-day TTL).

Continue with [Components](components.md) and [Data Model](data-model.md).
