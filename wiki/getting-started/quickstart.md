# Quickstart

This walkthrough takes you from zero to a monitored server with one alert and one synthetic check in five minutes.

## 1. Start the server

```bash
npx theoria-cli
```

Open `http://localhost:4000` and complete the registration form. The first account becomes the admin.

## 2. Grab your API key

Visit **Settings → API Keys** in the dashboard, or call:

```bash
curl -s http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer <JWT>" | jq -r .apiKey
```

## 3. Run an agent

On any machine you want to monitor:

```bash
npx theoria-cli agent \
  --url http://<theoria-host>:4000 \
  --key <API_KEY> \
  --id $(hostname)
```

Within 10 seconds the server appears in **Servers → Overview** with live CPU, memory, disk, and network charts.

## 4. Add an alert

```bash
curl -X POST http://localhost:4000/api/alerts/rules \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High CPU",
    "metricName": "cpu_usage",
    "operator": ">",
    "threshold": 85,
    "durationMinutes": 5,
    "severity": "warning"
  }'
```

The alert engine evaluates this rule against every metric the agent sends. After CPU exceeds 85% for five consecutive minutes, an entry appears under **Alerts → History** and is broadcast over Socket.IO.

## 5. Add a synthetic HTTP check

```bash
curl -X POST http://localhost:4000/api/http-checks \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Public website",
    "url": "https://example.com",
    "intervalSeconds": 60,
    "expectedStatus": 200,
    "timeoutMs": 10000
  }'
```

The scheduler runs the check every minute and records latency, status code, and SSL expiry into the `http_check_results` time-series table.

## 6. Wire up notifications

```bash
curl -X POST http://localhost:4000/api/notifications/channels \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ops Slack",
    "type": "slack",
    "config": {
      "webhookUrl": "https://hooks.slack.com/services/T0/B0/XXXX"
    }
  }'
```

Test it without firing a real alert:

```bash
curl -X POST http://localhost:4000/api/notifications/channels/<id>/test \
  -H "Authorization: Bearer <JWT>"
```

## What's next

- [Add more alert rules](../monitoring/alerts.md)
- [Publish a public status page](../monitoring/incidents-and-status-page.md)
- [Add a heartbeat to your nightly cron job](../monitoring/heartbeats.md)
- [Send custom metrics over OpenTelemetry](../integrations/opentelemetry.md)
- [Promote your single-node install to HA](../deployment/high-availability.md)
