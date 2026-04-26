# Notifications

Notification channels deliver alerts and incident updates to the systems your team already uses.

## Supported channel types

| Type | Required config |
|---|---|
| `slack` | `webhookUrl` (Incoming Webhook) |
| `discord` | `webhookUrl` |
| `teams` | `webhookUrl` (Incoming Webhook) |
| `email` | `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `from`, `to` |
| `telegram` | `botToken`, `chatId` |
| `webhook` | `url`, optional `headers`, optional `secret` (HMAC-SHA256 signature) |
| `pagerduty` | `routingKey` (Events API v2 integration key) |

## Create a channel

### Slack

```bash
curl -X POST https://monitor.example.com/api/notifications/channels \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ops Slack",
    "type": "slack",
    "config": {
      "webhookUrl": "https://hooks.slack.com/services/T0/B0/XXXX"
    }
  }'
```

### Email

```bash
curl -X POST https://monitor.example.com/api/notifications/channels \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "On-call email",
    "type": "email",
    "config": {
      "smtpHost": "smtp.sendgrid.net",
      "smtpPort": 587,
      "smtpUser": "apikey",
      "smtpPass": "SG.…",
      "from": "alerts@example.com",
      "to":   "oncall@example.com"
    }
  }'
```

### PagerDuty

```bash
curl -X POST https://monitor.example.com/api/notifications/channels \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PagerDuty primary",
    "type": "pagerduty",
    "config": {
      "routingKey": "<integration-key>"
    }
  }'
```

Theoria uses the [PagerDuty Events API v2](https://developer.pagerduty.com/docs/events-api-v2/overview/). `alert:fired` triggers `event_action: trigger`; `alert:resolved` triggers `event_action: resolve`. The PagerDuty incident dedup key is `theoria:<rule_id>:<server_id>`.

### Generic webhook

```bash
curl -X POST https://monitor.example.com/api/notifications/channels \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Internal alerter",
    "type": "webhook",
    "config": {
      "url": "https://internal.example.com/alerts",
      "headers": { "X-Service": "theoria" },
      "secret":  "shared-secret-for-hmac"
    }
  }'
```

The request is `POST application/json`. When `secret` is set, every request is signed with `X-Theoria-Signature: sha256=<hex>` over the raw body.

## Test a channel

```bash
curl -X POST https://monitor.example.com/api/notifications/channels/<id>/test \
  -H "Authorization: Bearer <jwt>"
```

A synthetic `alert:fired` payload is delivered through the channel's regular dispatch path. Use this to validate webhooks, SMTP creds, and Slack formatting without waiting for a real alert.

## List, update, delete

```bash
# List (smtpPass redacted as ••••••••)
curl https://monitor.example.com/api/notifications/channels \
  -H "Authorization: Bearer <jwt>"

# Update (omit smtpPass to keep the existing one)
curl -X PUT https://monitor.example.com/api/notifications/channels/<id> \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Renamed", "isActive": true, "config": { "from": "new@example.com" } }'

# Delete
curl -X DELETE https://monitor.example.com/api/notifications/channels/<id> \
  -H "Authorization: Bearer <jwt>"
```

## Routing & dispatch

When a rule fires, the dispatcher iterates every active channel and asks each one whether it cares about the event's severity. Routing is currently global (every active channel receives every alert); per-rule routing is planned in Phase 1+ of the v2 roadmap.

Each delivery attempt has a 10 s timeout and is retried up to 3 times with exponential backoff. Persistent failures auto-disable the channel after 10 consecutive errors.

## Payload reference

### Slack / Discord / Teams

Markdown-formatted message with severity colour, rule name, threshold, actual value, and a link to the dashboard.

### Email

Plain-text + HTML multi-part email with the same content. Subject:

```
[CRITICAL] Theoria alert: <ruleName> on <serverId>
```

### Webhook

```json
{
  "event": "alert:fired",
  "alert": {
    "id": "uuid",
    "ruleId": "uuid",
    "ruleName": "Web tier CPU saturated",
    "metricName": "cpu_usage",
    "operator": ">",
    "threshold": 85,
    "actualValue": 92.4,
    "severity": "warning",
    "firedAt": "2026-04-26T10:00:00.000Z",
    "labels": { "tier": "web", "host": "web-1" },
    "message": "cpu_usage was 92.4 (> 85) for 10m on web-1"
  },
  "deployment": { "url": "https://monitor.example.com" }
}
```

## Best practices

- **Test channels in staging first.** A misconfigured webhook silently swallowing alerts is worse than no webhook at all.
- **Use one channel per route.** Separate Slack channels for `info` vs `critical` rather than tagging messages — most chat clients render colour but don't filter on it.
- **Page only on `critical`.** Flooding PagerDuty with warnings teaches on-call to ignore it.
- **Rotate `smtpPass` and webhook secrets** on the same cadence as your other credentials.
