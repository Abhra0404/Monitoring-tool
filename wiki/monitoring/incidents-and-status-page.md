# Incidents & Status Page

Theoria includes a built-in status-page renderer and a lightweight incident state machine. Both are designed to be operated entirely via the API or dashboard — there is no separate CMS to maintain.

## Status page

Public status pages are rendered server-side at `/`. They show:

- A green / yellow / red banner reflecting current system status
- Per-service status (driven by `customServices` in the config)
- 90 days of uptime bars
- Active and recent incidents
- An RSS feed (`/feed.rss`) and SVG badge (`/badge.svg`)

### Configuring the status page

```bash
curl -X PUT https://monitor.example.com/api/status-page \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Example, Inc. Status",
    "description": "Real-time status for the Example platform.",
    "isPublic": true,
    "customDomain": "status.example.com",
    "customServices": [
      { "name": "API",       "status": "operational", "description": "REST + GraphQL gateways" },
      { "name": "Dashboard", "status": "operational", "description": "Web app at app.example.com" },
      { "name": "Workers",   "status": "operational", "description": "Background queue processors" }
    ]
  }'
```

### Custom domain

Set `customDomain` and point its DNS to your Theoria server. Theoria reads the `Host` header at request time and serves the status page when the domain matches. Pair this with [Caddy](../deployment/reverse-proxy.md) for automatic HTTPS via Let's Encrypt.

### Embeddable badge

```html
<img src="https://status.example.com/badge.svg" alt="Service status" />
```

The badge is regenerated on every request and reflects the current top-line status (`operational`, `degraded`, `outage`, `maintenance`).

### RSS

```html
<link rel="alternate" type="application/rss+xml" href="https://status.example.com/feed.rss" />
```

Each incident produces one item; updates appear inline in the description.

---

## Incidents

Incidents are first-class records that show up on the status page and in the unified events timeline. They follow a four-state machine:

```
investigating  →  identified  →  monitoring  →  resolved
```

### Create

```bash
curl -X POST https://monitor.example.com/api/incidents \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Increased API latency",
    "message": "Investigating elevated p95 latency on the public API.",
    "status": "investigating",
    "severity": "major",
    "services": ["API"]
  }'
```

| Field | Notes |
|---|---|
| `severity` | `minor` · `major` · `critical` · `maintenance` |
| `services` | Array of strings; should match `customServices[].name` so the status page can highlight them |

### Append updates

Incidents are append-only after creation. Add updates to record new findings:

```bash
curl -X POST https://monitor.example.com/api/incidents/<id>/updates \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Root cause identified: hot database query missing an index. Mitigation deploying now.",
    "status": "identified"
  }'
```

The new `status` updates the incident header. Each update is broadcast over Socket.IO as `incident:update`.

### Close out

When the incident is resolved:

```bash
curl -X POST https://monitor.example.com/api/incidents/<id>/updates \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Index deployed; latency back to baseline. Monitoring for 30 minutes.",
    "status": "monitoring"
  }'

# … 30 minutes later …

curl -X POST https://monitor.example.com/api/incidents/<id>/updates \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Resolved. Postmortem will be linked here within 48 hours.",
    "status": "resolved"
  }'
```

### Delete

`DELETE /api/incidents/:id` removes the incident *and* all its updates. There is no undo. Prefer adding a final `resolved` update unless the incident was created in error.

### Public access

Active incidents are exposed without auth at:

```
GET /incidents/public/active
```

This endpoint respects `isPublic`. When the status page is private, the JSON response is `[]` for unauthenticated callers.

## Tying alerts and incidents together

Theoria does **not** auto-create incidents from alerts. This is intentional — incident declaration is a human decision that should not be triggered by a single noisy threshold. The recommended workflow is:

1. An alert fires and pages an on-call engineer.
2. The engineer assesses and, if customer-impacting, creates an incident.
3. The incident appears on the public status page and in `/feed.rss`.
4. As the situation evolves, the engineer appends updates.
5. When stable, the engineer marks the incident `resolved` and links a postmortem in the final update.

The unified events timeline (`/api/events`) shows alerts and incident updates side by side so postmortems can replay the timeline accurately.
