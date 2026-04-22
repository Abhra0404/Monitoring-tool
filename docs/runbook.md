# Theoria Operator Runbook

This document captures the day-2 operations: how to deploy, how to
upgrade, how to recover, and where the dials live when things go wrong.

## Topology

```
   Agents ──POST /metrics──▶  Fastify server  ◀──WebSocket──  Dashboard
                                   │
                              ┌────┴────┐
                              ▼         ▼
                         Postgres     Redis (opt.)
                        (TimescaleDB)
```

- **Server**: stateless horizontally-scalable Node.js process. A replica
  set must share Postgres and (if present) Redis.
- **Postgres**: source of truth for metrics, events, and check results.
- **Redis**: pub/sub for Socket.IO fan-out plus rate-limit / lockout
  coordination across replicas. Optional — single-node deployments can
  skip it.
- **Agents**: stateless; they re-register their API key on start.

## Configuration quick reference

| Env var          | Required         | Purpose |
|------------------|------------------|---------|
| `DATABASE_URL`   | prod             | TimescaleDB connection. When unset the server falls back to the in-memory store persisted to `~/.theoria/store.json`. |
| `REDIS_URL`      | HA               | Enables Socket.IO pub/sub, Redis-backed rate-limit, and cross-replica account lockout. |
| `JWT_SECRET`     | yes              | Must be ≥16 chars; rotate via rolling restart (old refresh tokens are invalidated). |
| `CORS_ORIGINS`   | prod             | Comma-separated list. `*` is refused at boot in production. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first deploy | Creates a bootstrap admin. Remove after first login. |
| `SENTRY_DSN`     | optional         | Turns on Sentry error reporting. |

## Health probes

- `GET /health/live` — process liveness. 200 while the Node process
  responds; **never** depends on external systems.
- `GET /health/ready` — readiness. Returns 503 when Postgres or Redis
  (if configured) are unreachable.
- `GET /internal/metrics` — Prometheus exposition of request counts,
  metric ingestion rate, HTTP-check success ratios, alert evaluations.

## Common operations

### Rolling restart

```bash
kubectl rollout restart deploy/theoria
```

Fastify drains in-flight requests; Socket.IO disconnects clients cleanly
so they reconnect to a surviving replica. Shutdown timeout is 25 s,
matching the default pod `terminationGracePeriodSeconds` of 30 s.

### Rotating `JWT_SECRET`

1. Pick a new 32-byte random string (`openssl rand -hex 32`).
2. Update the Kubernetes secret.
3. `kubectl rollout restart deploy/theoria`.
4. Every logged-in user must re-authenticate; existing access tokens
   (≤15 min) continue to work against the new secret only until
   expiration.

### Backups

Run `deploy/scripts/backup.sh` as a CronJob. See the `S3_BUCKET` and
`RETENTION_DAYS` env vars for retention tuning.

Restore:

```bash
gunzip -c theoria-20250101T120000Z.sql.gz | psql "$DATABASE_URL"
```

### Resetting an admin password

If the only admin is locked out:

1. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars to the desired
   recovery credentials.
2. Restart the pod — bootstrap will overwrite the admin password.
3. Remove the env vars on the next deploy.

## Troubleshooting

| Symptom | Likely cause | Check |
|---------|--------------|-------|
| Metrics stop flowing | Agent API key regenerated, or clock skew > 5 min | `GET /api/auth/audit-log`; check agent logs |
| 429 from login | Account lockout engaged | Wait 15 min or clear Redis key `theoria:lockout:*` |
| Dashboard loses real-time updates | Socket.IO disconnect | Check `/health/ready`; verify Redis pub/sub with `redis-cli MONITOR` |
| CORS errors in browser | `CORS_ORIGINS` missing the dashboard hostname | Update env var and rolling-restart |
| `/health/ready` returns 503 | Postgres or Redis unhealthy | Read the `checks` object in the response body |

## Capacity planning

Rule of thumb for a single 2-vCPU / 1 GB replica:

- ~500 agents reporting every 5 seconds → ~100 req/s ingest.
- ~50 HTTP checks at 30 s interval → negligible.
- Alert engine evaluations: 1 ms per rule, fully synchronous.

Add replicas horizontally once CPU sustains > 70 % over 10 minutes. The
HPA in `charts/theoria/templates/hpa.yaml` automates this when enabled.
