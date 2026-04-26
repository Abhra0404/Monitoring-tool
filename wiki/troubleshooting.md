# Troubleshooting

A field guide to common problems and how to diagnose them.

## Server won't start

### `EADDRINUSE: address already in use :::4000`

Another process holds port 4000.

```bash
lsof -i :4000
# Kill the offender, or pick a different port:
npx theoria-cli --port 4001
```

### `database connection refused`

Postgres is not reachable from the Theoria container/process.

```bash
psql "$DATABASE_URL" -c "SELECT 1"
```

If the URL works from your shell but not from Theoria, check container networking (`docker compose logs postgres`, K8s NetworkPolicy, security group rules).

### `error: extension "timescaledb" is not available`

Theoria requires the TimescaleDB extension. Use the `timescale/timescaledb` image, or install the extension manually:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### `migration failed: relation "_drizzle_migrations" already exists`

A previous installation left the migrations table behind. Either restore from a backup, or for a fresh start:

```bash
npx theoria-cli --reset-database
```

This drops the migrations bookkeeping; **data is destroyed**.

## Agent issues

### Agent says "401 Unauthorized" on every tick

Wrong API key. Regenerate from the dashboard (Settings → Servers → ⋮ → Regenerate key) and update the agent's `/etc/theoria-agent.env`:

```
API_KEY=tha_<new-key>
```

Then `systemctl restart theoria-agent`.

### Agent says "404 Not Found" on `/metrics`

`API_URL` is wrong. Common mistakes:

- Trailing path: `https://monitor.example.com/api` — should not include `/api`.
- Missing scheme: `monitor.example.com` — must include `https://`.
- HTTP instead of HTTPS: many proxies redirect, breaking the bearer header.

### Agent appears in dashboard but immediately marks "offline"

The agent is sending payloads but the server marks it offline because of clock skew.

```bash
# On the agent host
timedatectl status     # check NTP sync
```

Theoria considers a server offline if no metric arrives within `2 * intervalSeconds + 5s`.

### `Docker socket: permission denied`

The agent lacks read access to `/var/run/docker.sock`. The shipped systemd unit grants this via `SupplementaryGroups=docker`. If you bypassed that:

```bash
usermod -aG docker theoria-agent     # if running as that user
# Or, if using DynamicUser:
mkdir -p /etc/systemd/system/theoria-agent.service.d
cat > /etc/systemd/system/theoria-agent.service.d/docker.conf <<'EOF'
[Service]
SupplementaryGroups=docker
EOF
systemctl daemon-reload && systemctl restart theoria-agent
```

## Dashboard issues

### "Not authorised" on every page after a deploy

`JWT_SECRET` changed between deploys. All sessions are invalidated; users must log in again. To avoid this, treat `JWT_SECRET` as a long-lived secret stored in your secrets manager.

### Real-time updates stop after ~30 seconds

A reverse proxy is terminating idle connections. Increase WebSocket idle timeout (Nginx `proxy_read_timeout`, ALB idle timeout, Cloudflare WS settings). See [Reverse Proxy](deployment/reverse-proxy.md).

### Charts show no data even though metrics are flowing

1. Confirm metrics are arriving: `GET /api/servers/<id>/metrics?metricName=cpu_usage&timeRange=15m`
2. If empty, verify the agent is using the correct `serverId`.
3. If the API returns data but the chart is blank, the dashboard's selected time range may pre-date the agent's start.

## Alert issues

### Alerts not firing

Walk through:

1. Rule enabled? `GET /api/alerts/rules/<id>`
2. Metric arriving? `GET /api/servers/<id>/metrics?metricName=…&timeRange=15m`
3. Threshold and comparator correct? Misconfigured `>` vs `>=` is common.
4. Duration: alerts wait until the breach holds for `forSeconds`. A flapping value won't fire.
5. Notification channel reachable? `POST /api/notifications/channels/<id>/test`.

Server logs include a per-evaluation line:

```
{"level":30,"ruleId":"…","ruleName":"High CPU","value":91,"threshold":90,"breach":true}
```

Grep for the rule ID to see what the engine sees.

### Alert fires but no notification received

- Channel configuration may be wrong. Use the test endpoint.
- Slack/Teams webhooks expire if the integration is removed in Slack — recreate the channel.
- SMTP credentials: try sending via `swaks` from the same host.
- PagerDuty: confirm the integration key is for the *correct* service.

### Duplicate alerts fire across replicas

You're running multiple replicas without Redis. Set `REDIS_URL` so the alert engine can deduplicate breach state. See [High Availability](deployment/high-availability.md).

## Plugin issues

### `plugin install` fails with "manifest validation failed"

Read the `details` array in the error. Common causes:

- Missing `name`, `version`, `type`, or `entry`.
- A `permission` value not in the supported list.
- `configSchema` uses unsupported JSON Schema features (`$ref`, `oneOf`, etc.).

### Plugin tick keeps timing out

The default `timeoutMs` is 100 ms. Tasks that scrape large APIs or do crypto need more:

```json
{ "timeoutMs": 5000 }
```

Re-publish the plugin with the new manifest, or, for a one-off, edit the bound instance config (if your version supports per-instance overrides).

### Plugin can't reach an internal hostname

The plugin runs inside the Theoria server's network, not the agent's. If you need to reach an internal database, run Theoria on the same network or use a tunnel.

## Database issues

### Postgres pool exhausted

Symptoms: 503 responses, `theoria_db_pool_utilization` near 1.0.

- Increase the pool size: `DB_POOL_MAX=30`
- Add PgBouncer in `transaction` pooling mode for very high replica counts
- Investigate slow queries in `pg_stat_statements`

### Hypertable bloat

TimescaleDB compression policy runs every hour after 24 h. If chunks are not being compressed:

```sql
SELECT * FROM timescaledb_information.compression_settings;
SELECT * FROM timescaledb_information.jobs WHERE proc_name = 'policy_compression';
SELECT alter_job(<job_id>, scheduled => true);
```

## Performance

### High CPU with many agents

Each agent posts every 5 s. With 1,000 agents that's 200 req/s — modest, but the alert engine evaluates every rule per metric. Profile with:

```bash
NODE_OPTIONS="--cpu-prof --cpu-prof-dir=/tmp/profiles" npx theoria-cli
```

Open the `.cpuprofile` in Chrome DevTools → Performance.

### Slow dashboard queries

The metrics query path uses TimescaleDB continuous aggregates for ranges > 24 h. If queries are slow:

```sql
SELECT view_name, last_run_started_at, last_run_status
FROM timescaledb_information.continuous_aggregates
JOIN timescaledb_information.jobs USING (mat_hypertable_name);
```

A failed continuous aggregate refresh can cause the query to fall back to raw data. Re-run with:

```sql
CALL refresh_continuous_aggregate('metrics_5m', NULL, NULL);
```

## When to file an issue

If you've exhausted this page:

1. Collect: server version (`/version`), agent version, Postgres version, deployment method, and the relevant log excerpts (with secrets redacted).
2. Open an issue at <https://github.com/theoria-monitoring/theoria/issues> with the above.
3. For security issues, follow [SECURITY.md](../SECURITY.md) instead.
