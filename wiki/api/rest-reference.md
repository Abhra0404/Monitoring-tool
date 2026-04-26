# REST API Reference

Theoria exposes a REST API alongside its dashboard. Every endpoint is also documented as live OpenAPI 3.0 at `/api/docs` (Swagger UI) and `/api/docs.json` (raw spec).

## Conventions

- **Base URL:** the same origin as the dashboard (e.g. `https://monitor.example.com`).
- **Content type:** `application/json` for all request and response bodies.
- **Auth header:** `Authorization: Bearer <token>` for both JWTs and API keys.
- **Errors:** RFC 7807 JSON `{"statusCode":400,"error":"Bad Request","message":"…"}`.
- **Timestamps:** ISO 8601 strings on the wire, ms-since-epoch in time-series payloads.
- **Pagination:** cursor-based on `/api/events`; offset/limit elsewhere where appropriate.

## Endpoint matrix

### Auth — `/api/auth`

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/register` | none | First user becomes admin. Rate-limited 5/min |
| `POST` | `/login` | none | Account lockout after `LOCKOUT_THRESHOLD` failures |
| `POST` | `/refresh` | refresh token | Old refresh token is revoked atomically |
| `POST` | `/logout` | JWT | Revokes the active refresh token |
| `GET` | `/me` | JWT | Current user, API key, feature flags |
| `POST` | `/regenerate-key` | JWT | Rotates the API key |

### Metric ingestion

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/metrics` | API key | Hot path; rate-limited 10/sec per IP |
| `POST` | `/v1/metrics` | API key | OpenTelemetry HTTP/JSON |
| `POST` | `/heartbeats/ping/:slug` | none | Public; rate-limited 60/min per slug |

### Servers — `/api/servers`

| Method | Path | Notes |
|---|---|---|
| `GET` | `/` | List servers (auto-marks offline if `last_seen` > 60 s) |
| `GET` | `/:serverId` | Single server detail |
| `GET` | `/:serverId/metrics?timeRange=…` | History; `timeRange` ∈ `5m, 15m, 1h, 6h, 24h, 7d` |

### Alerts — `/api/alerts`

| Method | Path | Notes |
|---|---|---|
| `GET` | `/rules` | List rules |
| `POST` | `/rules` | Create / upsert |
| `PATCH` | `/rules/:ruleId/toggle` | Activate / deactivate |
| `DELETE` | `/rules/:ruleId` | Remove rule + resolve open history |
| `GET` | `/history?status=&limit=` | Paginated history (limit ≤ 200) |
| `GET` | `/active-count` | Currently-firing alert count |

### Synthetic checks

The four `/api/<kind>-checks` resources share an identical CRUD surface.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/http-checks` | List (results array stripped) |
| `POST` | `/api/http-checks` | Create — returns `201` |
| `GET` | `/api/http-checks/:checkId` | Detail |
| `PATCH` | `/api/http-checks/:checkId/toggle` | Activate / deactivate (reschedules runner) |
| `DELETE` | `/api/http-checks/:checkId` | Delete + unschedule |

Replace `http-checks` with `tcp-checks`, `ping-checks`, or `dns-checks` for the others.

### Heartbeats — `/api/heartbeats`

| Method | Path | Notes |
|---|---|---|
| `GET` | `/` | List monitors |
| `POST` | `/` | Create. Slug must match `^[a-z0-9][a-z0-9-]{1,62}$`, globally unique |
| `PATCH` | `/:monitorId/toggle` | |
| `DELETE` | `/:monitorId` | |

### Notifications — `/api/notifications`

| Method | Path | Notes |
|---|---|---|
| `GET` | `/channels` | `smtpPass` redacted |
| `POST` | `/channels` | Type-specific config validation |
| `PUT` | `/channels/:channelId` | Redact-preserving updates |
| `DELETE` | `/channels/:channelId` | |
| `POST` | `/channels/:channelId/test` | Send a test message |

### Incidents — `/api/incidents`

| Method | Path | Notes |
|---|---|---|
| `GET` | `/` | List |
| `POST` | `/` | Create |
| `GET` | `/:incidentId` | Detail + updates |
| `DELETE` | `/:incidentId` | |
| `POST` | `/:incidentId/updates` | Append a new update |

### Status page

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/` | none | Public status HTML (respects `customDomain`) |
| `GET` | `/uptime-days` | none | 90-day CSV |
| `GET` | `/badge.svg` | none | Embeddable SVG badge |
| `GET` | `/feed.rss` | none | RSS feed |
| `GET` | `/incidents/public/active` | none | JSON of active incidents |
| `GET` | `/api/status-page` | JWT | Read config |
| `PUT` | `/api/status-page` | JWT | Update config |

### Events — `/api/events`

| Method | Path | Notes |
|---|---|---|
| `GET` | `/?cursor=&limit=&kinds=&source=&since=` | Cursor-paginated unified timeline. `limit ≤ 500`, `kinds` is CSV |
| `GET` | `/correlate?at=` | Returns events ±5 min around the given ms timestamp |

### CI/CD pipelines — `/api/pipelines`

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/webhook` | API key | Auto-detects GitHub Actions / GitLab / Jenkins / Bitbucket payload |
| `GET` | `/?source=` | JWT | List, filterable by source |
| `GET` | `/:pipelineId` | JWT | Detail |

### Docker — `/api/docker`

| Method | Path |
|---|---|
| `GET` | `/` (latest snapshot across all servers) |
| `GET` | `/:serverId` |

### Plugins — `/api/plugins`

| Method | Path | Notes |
|---|---|---|
| `GET` | `/` | Installed + discoverable + instances |
| `POST` | `/install` | npm install into `~/.theoria/plugins` |
| `POST` | `/uninstall/:pluginName` | |
| `POST` | `/instances` | Bind a plugin to a config |
| `PATCH` | `/instances/:instanceId` | Toggle |
| `DELETE` | `/instances/:instanceId` | |

### Internal

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | none | Liveness probe |
| `GET` | `/internal/metrics` | none | Prometheus self-metrics |
| `GET` | `/api/docs` | none | Swagger UI |
| `GET` | `/api/docs.json` | none | OpenAPI 3.0 spec |

---

## Status codes

| Code | Meaning |
|---|---|
| `200` | OK |
| `201` | Created (POST that returns the new resource) |
| `204` | No content (DELETE / toggle) |
| `400` | Validation failed (zod error in `details`) |
| `401` | Missing or invalid auth |
| `403` | Authenticated but not allowed |
| `404` | Resource not found / not owned by you |
| `409` | Conflict (e.g. heartbeat slug already taken) |
| `429` | Rate-limited |
| `500` | Server error (correlation id in response) |

## OpenAPI

The full spec, including request/response schemas, lives at `/api/docs.json`. Tools like `openapi-generator` or `orval` can use this to generate type-safe clients in any language.

```bash
curl https://monitor.example.com/api/docs.json > theoria.openapi.json
npx openapi-typescript theoria.openapi.json -o theoria.d.ts
```
