# Runbook

Day-2 operations for a production Theoria deployment.

## Health checks

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /health` | none | `200 OK` once the server is accepting traffic |
| `GET /health?deep=1` | none | `200 OK` only if Postgres + Redis are reachable |
| `GET /internal/metrics` | bearer (`INTERNAL_METRICS_TOKEN`) | Prometheus-format self-metrics |

Use `/health` for liveness and `/health?deep=1` for readiness.

## Restarts

### Rolling restart (Kubernetes)

```bash
kubectl rollout restart deployment/theoria -n theoria
kubectl rollout status  deployment/theoria -n theoria
```

The rollout uses `maxSurge=1, maxUnavailable=0`. Agents reconnect within the LB readiness window.

### Rolling restart (docker-compose)

```bash
docker compose up -d --no-deps --force-recreate theoria
```

Single-replica compose deployments incur ~5 s of downtime. Agents buffer metrics in memory and drain on reconnect.

## Rotating the JWT secret

1. Generate a new secret: `openssl rand -hex 32`
2. Update the secret in the orchestrator (`kubectl edit secret theoria-auth` or update `.env`).
3. Restart pods. **All existing user sessions are invalidated**; users must log in again.
4. Refresh tokens issued under the old secret will reject; clients fetch new ones via the login flow.

Plan rotations during low-traffic windows or schedule via maintenance announcement.

## Regenerating an agent API key

Per agent, via API or dashboard:

```bash
curl -X POST https://monitor.example.com/api/servers/<id>/regenerate-key \
  -H "Authorization: Bearer <jwt>"
```

The old key is revoked immediately. Update `/etc/theoria-agent.env` on the host and restart:

```bash
systemctl restart theoria-agent
```

The agent reconnects with the new key on its next tick.

## Logs

Theoria logs structured JSON via Pino.

### systemd

```bash
journalctl -u theoria -f
journalctl -u theoria -p err --since "1 hour ago"
```

### Docker

```bash
docker logs -f theoria
docker logs --since 1h theoria 2>&1 | grep '"level":50'   # error level
```

### Kubernetes

```bash
kubectl logs -f -n theoria -l app.kubernetes.io/name=theoria
kubectl logs -n theoria -l app.kubernetes.io/name=theoria --previous   # crashed pod
```

Each request log line carries a `correlationId` echoed back in the `X-Correlation-Id` response header — useful for tracing user-reported issues.

## Common diagnostics

### "Agent is offline"

1. SSH to the host: `systemctl status theoria-agent`
2. Tail logs: `journalctl -u theoria-agent --since "10 min ago"`
3. Check connectivity: `curl -I https://monitor.example.com/health`
4. Verify API key: `curl -X POST https://monitor.example.com/metrics -H "Authorization: Bearer <key>" -H 'Content-Type: application/json' -d '{}'` should return 400, not 401.

### "Alerts not firing"

1. Confirm rule is enabled: `GET /api/alerts/rules`
2. Confirm metric is arriving: `GET /api/servers/<id>/metrics?metricName=<name>&timeRange=15m`
3. Check evaluation logs for the rule: `grep '"ruleId":"<id>"' /var/log/theoria.log`
4. Verify notification channel: `POST /api/notifications/channels/<id>/test`

See [Troubleshooting](../troubleshooting.md) for the full table.

## Capacity warnings

The server emits warning logs when:

- Postgres pool utilisation > 80 %
- Redis command latency p95 > 50 ms
- Plugin worker_thread CPU time > `timeoutMs` * 0.8
- Metric ingestion queue > 10,000

Watch `/internal/metrics` for the corresponding gauges:

```
theoria_db_pool_utilization
theoria_redis_latency_seconds
theoria_plugin_tick_duration_seconds
theoria_ingest_queue_depth
```

## Maintenance mode

Set `MAINTENANCE_MODE=true` to:

- Return `503` from `/api/*` (clients should retry with backoff)
- Continue accepting `/metrics` (so agents don't overflow buffers)
- Disable alert evaluation
- Disable plugin tick scheduling

Useful during long migrations.

## Disaster recovery

See [Backup & Restore](backup-restore.md). RPO/RTO depend on your Postgres backup cadence.
