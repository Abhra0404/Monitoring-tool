# High Availability

Theoria is built as a stateless application tier sitting on top of stateful Postgres + Redis. This page describes the reference HA topology and the failure modes it covers.

## Reference topology

```
                 ┌──────────────────┐
   Agents ──────►│   Load Balancer  │◄──── Dashboards / API consumers
                 │  (TLS terminator)│
                 └────────┬─────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ┌────────┐        ┌────────┐        ┌────────┐
   │ App #1 │        │ App #2 │        │ App #3 │   (stateless)
   └───┬────┘        └───┬────┘        └───┬────┘
       │                 │                 │
       └──────┬──────────┼──────────┬──────┘
              ▼          ▼          ▼
        ┌────────────────────────────────┐
        │  Postgres + TimescaleDB        │  (primary + replica)
        │  Redis (Sentinel / managed)    │
        └────────────────────────────────┘
```

- **3 app replicas** spread across availability zones via pod anti-affinity.
- **Postgres** in primary/replica config, ideally a managed offering (RDS, Cloud SQL, Crunchy Bridge).
- **Redis** for Socket.IO fan-out, distributed rate limiting, and breach-state coordination.
- **Load balancer** can be your ingress controller, an ALB/NLB, or Caddy in front. No sticky sessions required.

## State distribution

| State | Where it lives | Replicated? |
|---|---|---|
| Users, servers, alert rules, plugin configs | Postgres | Yes (primary/replica) |
| Metrics, HTTP check results, container snapshots | Postgres (TimescaleDB hypertables) | Yes |
| Alert history | Postgres | Yes |
| Live Socket.IO subscriptions | Per-pod memory | No (Redis pub/sub spans pods) |
| Breach state for alert deduplication | Redis | Yes |
| Rate limit counters | Redis | Yes |
| Plugin worker_threads | Per-pod memory | No (each pod runs each plugin instance) |

The only "interesting" piece is breach state. Without Redis, each pod tracks breaches independently and can fire duplicate alerts. With Redis, the alert engine uses a `SETNX`-based lock so only one pod transitions a given rule from `ok` → `firing`.

## Plugins under HA

When you bind a plugin instance, every pod runs a copy of its worker. To prevent N-fold execution of `server-check` plugins, the scheduler uses a Redis lock keyed on `plugin:tick:<instanceId>:<minuteBucket>`. Only the pod that wins the lock executes the tick.

`enricher` and `sink` plugins handle every event on every pod, but they are filtered through the same per-event Redis dedup key, so each event is processed exactly once across the cluster.

## Failure scenarios

| Failure | Effect | Recovery |
|---|---|---|
| One app pod crashes | LB removes it within `readinessProbe.failureThreshold * periodSeconds`; agents reconnect to a healthy pod | Auto |
| All app pods crash | API + ingestion down; agents buffer up to `MAX_BUFFER` metrics in memory | Restart pods |
| Postgres primary fails | API returns 503 with `Retry-After`; agents continue buffering | Failover to replica |
| Redis fails | Socket.IO falls back to per-pod broadcast (clients see fewer real-time updates); breach dedup degrades to per-pod | Restart Redis |
| Network partition between pods | Each pod operates independently; on heal, Redis adapter re-syncs | Auto |

## Postgres considerations

- **TimescaleDB compression** kicks in at 24 h; ensure your replica has enough headroom.
- **Connection pooling:** use PgBouncer in `transaction` mode in front of Postgres if you exceed ~50 app pods. Theoria's per-pod pool defaults to 10 connections.
- **Read replica routing:** Theoria uses the primary for everything. Read-replica routing is on the roadmap for the metrics query path.

## Redis considerations

- Use **Redis 7+** for the Sharded Pub/Sub adapter or stick with classic pub/sub on managed Redis.
- Set `maxmemory-policy allkeys-lru` if you size Redis tightly — Theoria's keys are short-lived (minutes).
- Enable **AOF** if you care about preserving rate-limit state across restarts; in practice, losing it for 30 s is harmless.

## Capacity planning

Rough numbers from a single-pod baseline (2 vCPU / 1 GiB):

| Metric | Single pod ceiling |
|---|---|
| Servers reporting (5 s interval) | ~2,000 |
| Metric points/sec ingested | ~10,000 |
| Concurrent dashboard sessions | ~500 |
| Alert rule evaluations/sec | ~5,000 |

Scale linearly by adding pods until you hit Postgres write throughput. TimescaleDB on modest hardware (4 vCPU / 16 GiB / NVMe) handles ~100k metric points/sec with default compression.

## Deploying

The [Helm chart](kubernetes-helm.md) ships with HA defaults. For Docker Compose deployments, see the multi-host example in `deploy/README.md`.
