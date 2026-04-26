# Heartbeats (Cron Monitoring)

A heartbeat monitor watches for an HTTP request to arrive at a known URL on a schedule. If it doesn't arrive within a grace period, an alert fires. This is the simplest way to monitor cron jobs, scheduled CI tasks, and ETL pipelines.

## Create a monitor

```bash
curl -X POST https://monitor.example.com/api/heartbeats \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nightly database backup",
    "slug": "nightly-db-backup",
    "expectedEverySeconds": 86400,
    "gracePeriodSeconds": 600
  }'
```

| Field | Notes |
|---|---|
| `slug` | Globally unique. Pattern: `^[a-z0-9][a-z0-9-]{1,62}$` |
| `expectedEverySeconds` | The expected cadence. `86400` = once per day |
| `gracePeriodSeconds` | Allowed lateness before the monitor flips to `late` |

## Ping it from your job

The ping endpoint is **public** (no auth) so you can call it from anywhere. It is rate-limited to **60 pings per minute per slug**.

### Bash

```bash
0 3 * * *  /usr/local/bin/backup.sh && curl -fsS https://monitor.example.com/heartbeats/ping/nightly-db-backup
```

The `&&` ensures the ping fires only on success. If `backup.sh` exits non-zero the ping is skipped, the monitor goes late, and the alert fires.

### GitHub Actions

```yaml
- name: Notify Theoria
  if: success()
  run: curl -fsS https://monitor.example.com/heartbeats/ping/${{ env.MONITOR_SLUG }}
```

### Python

```python
import requests, sys

try:
    do_the_work()
    requests.post("https://monitor.example.com/heartbeats/ping/nightly-etl", timeout=10)
except Exception as exc:
    print(exc, file=sys.stderr)
    sys.exit(1)
```

## State machine

| State | Meaning |
|---|---|
| `up` | Last ping arrived within `expectedEverySeconds + gracePeriodSeconds` |
| `late` | The window has elapsed; an alert has been emitted |
| `paused` | Toggled off via `PATCH /api/heartbeats/:id/toggle`; no alerts fire |
| `unknown` | Never pinged since creation |

The state-flip evaluator runs every 30 seconds (configurable via `HEARTBEAT_EVAL_INTERVAL`). Each transition fires an `alert:fired` or `alert:resolved` event with severity `error` by default. Override severity per monitor by adding a matching alert rule on the synthetic metric `heartbeat_status`.

## CRUD

```bash
# List
curl https://monitor.example.com/api/heartbeats -H "Authorization: Bearer <jwt>"

# Toggle
curl -X PATCH https://monitor.example.com/api/heartbeats/<id>/toggle -H "Authorization: Bearer <jwt>"

# Delete
curl -X DELETE https://monitor.example.com/api/heartbeats/<id> -H "Authorization: Bearer <jwt>"
```

## Why a public ping endpoint?

Cron jobs run in environments that often can't store secrets safely. The slug acts as a low-entropy capability token: the rate limit prevents abuse, and the worst-case impact of a leaked slug is that a third party can mark your monitor as alive when it isn't.

If you need a stronger guarantee, prefix the slug with a random nonce (`prod-9f3d-nightly-backup`) — the slug name itself becomes the secret.

## Patterns

### Run-of-job heartbeat

Ping at the start *and* end of a job to detect hangs:

```bash
curl -fsS https://monitor.example.com/heartbeats/ping/etl-start
run_etl
curl -fsS https://monitor.example.com/heartbeats/ping/etl-end
```

Two monitors, two slugs. Compare timestamps to compute job duration.

### Failure heartbeat

Some teams flip the polarity: the job pings *only on failure* so a missed ping means success:

```bash
run_job || curl -fsS https://monitor.example.com/heartbeats/ping/job-failed
```

This works but loses the "still alive" signal — if the job dies before it can call `curl`, you won't know.
