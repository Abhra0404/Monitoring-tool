# Alerts

Theoria alerts are threshold rules evaluated against incoming metrics on the hot path. Rules can be flat ("fire immediately when CPU > 90%") or duration-based ("fire only if CPU > 85% for 10 minutes").

## Anatomy of a rule

```json
{
  "name": "Web tier CPU saturated",
  "metricName": "cpu_usage",
  "labels": { "tier": "web" },
  "operator": ">",
  "threshold": 85,
  "durationMinutes": 10,
  "severity": "warning",
  "isActive": true
}
```

| Field | Type | Notes |
|---|---|---|
| `name` | string | Free-form label, displayed in notifications |
| `metricName` | string | Must match a metric the system actually receives |
| `labels` | jsonb | Optional. Acts as an AND filter on metric labels |
| `operator` | enum | `<` `>` `<=` `>=` `==` `!=` |
| `threshold` | number | Compared against the metric value |
| `durationMinutes` | number | Must remain in breach this long before firing. `0` = page immediately |
| `severity` | enum | `info` · `warning` · `error` · `critical` |
| `isActive` | bool | Toggle without deleting |

## Lifecycle

```
        evaluate every metric
                 │
                 ▼
       in breach now? ──no──▶ if open: resolve, emit alert:resolved
                 │
                yes
                 │
                 ▼
       breach state Map: first-seen-at = now (if absent)
                 │
                 ▼
       seen long enough (≥ durationMinutes)? ──no──▶ keep watching
                 │
                yes
                 │
                 ▼
   INSERT into alert_history (status="firing")
   emit alert:fired over Socket.IO
   dispatch to notification channels
```

The breach state is held in an in-memory `Map` for fast evaluation. In HA deployments it is also published to Redis so a failover replica picks up where the previous one left off.

## Severity semantics

| Severity | Recommended use | Default routing |
|---|---|---|
| `info` | Informational, no human action expected | Slack info channel |
| `warning` | Investigate at business hours | Slack ops channel |
| `error` | Investigate now | Slack + email |
| `critical` | Page someone | Slack + email + PagerDuty |

Severity is a free signal — Theoria does not gate features on it. Routing by severity is a notification-channel concern.

## CRUD

### Create

```bash
curl -X POST https://monitor.example.com/api/alerts/rules \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d @rule.json
```

### List

```bash
curl https://monitor.example.com/api/alerts/rules \
  -H "Authorization: Bearer <jwt>"
```

### Toggle

```bash
curl -X PATCH https://monitor.example.com/api/alerts/rules/<id>/toggle \
  -H "Authorization: Bearer <jwt>"
```

### Delete

Deleting a rule auto-resolves any open `firing` history rows:

```bash
curl -X DELETE https://monitor.example.com/api/alerts/rules/<id> \
  -H "Authorization: Bearer <jwt>"
```

## History

```bash
# Last 100 firing events
curl "https://monitor.example.com/api/alerts/history?status=firing&limit=100" \
  -H "Authorization: Bearer <jwt>"
```

History rows snapshot the rule and the breaching value at firing time, so renames/deletes do not lose context. Rows older than 30 days are auto-purged.

## Active alert count

For status badges and dashboards:

```bash
curl https://monitor.example.com/api/alerts/active-count \
  -H "Authorization: Bearer <jwt>"
# {"count": 2}
```

## Notification dispatch

Each `alert:fired` event is fanned out to every active notification channel that subscribes to its severity. See [Notifications](notifications.md) for channel configuration.

The dispatcher retries each channel up to 3 times with exponential backoff. If all retries fail, a `notification:failed` event is recorded and the channel is auto-disabled after 10 consecutive failures.

## Best practices

- **Use `durationMinutes` aggressively.** Most operational metrics flap; requiring a sustained breach reduces noise dramatically.
- **Use `labels` to scope rules.** A single rule with `labels: {"role":"db"}` is cheaper than one rule per host.
- **Pair every page with a runbook.** Put a link in the rule `name` (e.g. `"DB CPU >90% — see /runbooks/db-cpu"`).
- **Snapshot rules in version control.** Keep a JSON file per environment and apply via `curl` in CI.
- **Don't alert on every metric.** Define what "broken" means for each service and alert only on those signals.
