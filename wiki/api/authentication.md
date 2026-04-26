# Authentication

Theoria uses two distinct credential types and a single header format.

| Credential | Used by | Lifetime | Where it travels |
|---|---|---|---|
| **JWT access token** | Dashboard users | 15 min | `Authorization: Bearer <jwt>` |
| **JWT refresh token** | Dashboard users | 30 d | `POST /api/auth/refresh` body |
| **API key** | Agents, OTLP senders, CI webhooks | indefinite (rotatable) | `Authorization: Bearer <api-key>` |

## User accounts

### Registration

```http
POST /api/auth/register
Content-Type: application/json

{ "email": "alice@example.com", "password": "correcthorsebatterystaple" }
```

The first registration in a new deployment becomes the admin. Self-registration can be disabled in Phase 1+ via `AUTH_REGISTRATION_ENABLED=false`.

Rate-limited to **5 requests per minute per IP**.

### Login

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "alice@example.com", "password": "…" }
```

Successful response:

```json
{
  "accessToken":  "eyJhbGciOi…",
  "refreshToken": "eyJhbGciOi…",
  "user": { "id": "…", "email": "alice@example.com", "role": "admin" }
}
```

Failures bump a per-account counter. After `LOCKOUT_THRESHOLD` (default 5) failures the account is locked for `LOCKOUT_DURATION_SECONDS` (default 900). The lockout store is Redis-backed when `REDIS_URL` is set, in-memory otherwise. Endpoints rate-limited to **10 / min / IP**.

### Refresh

```http
POST /api/auth/refresh
Content-Type: application/json

{ "refreshToken": "…" }
```

Returns a new access **and** a new refresh token. The old refresh token is revoked atomically — replays fail.

### Logout

```http
POST /api/auth/logout
Authorization: Bearer <accessToken>
```

Revokes the active refresh token. The access token continues to work until it expires (≤ 15 min).

### Inspecting the current session

```http
GET /api/auth/me
Authorization: Bearer <accessToken>
```

```json
{
  "id": "…",
  "email": "alice@example.com",
  "role": "admin",
  "apiKey": "th_live_…",
  "featureFlags": { "anomalyDetection": true }
}
```

## API keys

Every user has exactly one API key. It is shown once on first login and is stored hashed; rotate it anytime:

```http
POST /api/auth/regenerate-key
Authorization: Bearer <accessToken>
```

```json
{ "apiKey": "th_live_…" }
```

Use the key in `Authorization: Bearer …` for:

- The Theoria agent (`POST /metrics`)
- OpenTelemetry senders (`POST /v1/metrics`)
- CI/CD webhooks (`POST /api/pipelines/webhook`)

API keys are checked using a constant-time comparison. There is no per-key rate limit beyond the per-IP limit on each endpoint.

## JWT details

| Property | Value |
|---|---|
| Algorithm | HS256 |
| Signing secret | `JWT_SECRET` (32-byte hex recommended) |
| Access TTL | `JWT_ACCESS_TTL` (default `15m`) |
| Refresh TTL | `JWT_REFRESH_TTL` (default `30d`) |
| Issuer claim | `theoria` |
| Subject claim | user UUID |
| Custom claims | `email`, `role` |

If you change `JWT_SECRET`, all access tokens are invalidated immediately and users must log in again.

## Cookie vs header

The dashboard sends the access token as an `Authorization` header — cookies are **not** used for authentication, which removes a class of CSRF concerns. Make sure your reverse proxy doesn't strip the header.

## Recommendations

- In production, terminate TLS at the proxy and pass headers through unchanged.
- Set `CORS_ORIGINS` to the exact origins of your dashboard. The chart and CLI both refuse `*` in production.
- Rotate the JWT signing secret on a yearly cadence (see [Runbook](../operations/runbook.md)).
- For agents on shared/untrusted hosts, generate a dedicated user account (Phase 1+) and rotate its API key after the host is decommissioned.
