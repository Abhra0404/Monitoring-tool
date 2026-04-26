# Security Overview

Theoria is designed to be self-hosted in environments that range from a homelab VM to a multi-tenant production cluster. This page describes the threat model, the trust boundaries, and the controls in place.

## Threat model

Adversaries Theoria's design considers:

| Adversary | Capability | Mitigations |
|---|---|---|
| Unauthenticated network attacker | Reach the public dashboard / API | TLS, rate limiting, JWT auth, CORS allowlist |
| Stolen agent API key | Submit fake metrics for that server | Per-server API keys; rotate via dashboard; signed payload roadmap |
| Compromised plugin package | Run code inside the server process | `worker_threads` sandbox; capability allowlist; CPU timeout |
| Malicious user with valid login | Read other tenants' data | Per-user data isolation; ownership checks on every query |
| Insider with database access | Read all data | Out of scope — control DB access via your provider's IAM |

Out of scope: physical security of the host, supply chain of npm packages outside Theoria's control, and side-channel attacks on the underlying hardware.

## Trust boundaries

```
┌──────────────────────────────────────────────────────────────┐
│ Browser / Operator                                           │
│   ↑↓ JWT (HS256, 15 min access + 7 day refresh)              │
├──────────────────────────────────────────────────────────────┤
│ Reverse proxy (TLS termination)                              │
│   ↑↓ HTTP                                                    │
├──────────────────────────────────────────────────────────────┤
│ Theoria server                                               │
│   ├─ /api/*         → JWT auth                               │
│   ├─ /metrics       → API key auth                           │
│   ├─ /internal/*    → bearer token auth                      │
│   ├─ Plugins (worker_threads, capability sandbox)            │
│   └─ Drizzle + raw SQL with parameter binding                │
│   ↑↓                                                         │
│ Postgres / Redis (private network)                           │
└──────────────────────────────────────────────────────────────┘
        ↑
        │  API key per server
        │
┌───────┴──────────────┐
│ Agents (per host)    │
└──────────────────────┘
```

## Authentication

Two distinct credential types:

### JWT (operator access)

- Algorithm: **HS256** with `JWT_SECRET` (≥ 32 random bytes)
- Access token TTL: **15 minutes**
- Refresh token TTL: **7 days**, rotated on each use, invalidated on logout
- Stored in `httpOnly` `Secure` `SameSite=Strict` cookies
- Rotation: changing `JWT_SECRET` invalidates all sessions

See [Authentication](../api/authentication.md) for the full flow.

### API key (agent access)

- 256-bit random, base64-url encoded, prefixed `tha_` (Theoria Agent)
- Per-server, generated on server creation
- Stored as `argon2id` hash in Postgres
- Sent as `Authorization: Bearer <key>` to `/metrics`
- Rotation: per-server endpoint or dashboard action

### Internal metrics token

- Optional; set `INTERNAL_METRICS_TOKEN` to require bearer auth on `/internal/metrics`
- Not user-facing; intended for Prometheus scrapers

## Authorization

Every query that touches user-owned resources passes through an ownership check. Example: `GET /api/servers/:id` resolves the server, then asserts `server.userId === req.user.id`. There is no shared admin role today; multi-tenancy isolation is per-record.

API key auth resolves to the API key's owner, who then has read/write access only to their own server record.

## Rate limiting

Per-IP and per-token rate limits, backed by Redis when available, in-memory otherwise:

| Endpoint group | Limit |
|---|---|
| `POST /api/auth/login` | 5 req / 15 min / IP |
| `POST /api/auth/register` | 3 req / 1 h / IP |
| `POST /metrics` | 60 req / min / API key |
| All `/api/*` (authenticated) | 600 req / min / user |
| All anonymous | 60 req / min / IP |

Exceeding a limit returns `429 Too Many Requests` with `Retry-After`.

## Input validation

Every request body is validated against a [Zod](https://zod.dev) schema before reaching the controller. Unknown fields are stripped; type coercion is explicit.

SQL queries use parameterised statements via Drizzle. Raw SQL is restricted to migration files.

## Secrets handling

- `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, plugin configs containing passwords — never logged.
- The Pino redact list strips `req.headers.authorization`, `req.headers.cookie`, `body.password`, `body.apiKey`, and `*.password`.
- Plugin configs marked `format: password` in `configSchema` are masked in API responses.

## Plugin sandbox

Plugins run in `worker_threads` with:

- A custom module resolver that rejects `fs`, `child_process`, `net`, `dgram`, `cluster`, `vm`, `process` (binding APIs).
- A capability whitelist enforced by the host wrapper exposed to the worker.
- A per-tick CPU timeout (`timeoutMs`).
- No access to the parent process's environment variables.
- Outbound HTTP via the host's `http.outbound` capability with a 5 s default timeout.

A plugin that violates these constraints is killed and disabled until manual re-enable.

See [Plugin Overview](../plugins/overview.md) for the full capability model.

## Docker socket warning

Mounting `/var/run/docker.sock` into the agent grants root-equivalent access on the host. Theoria mounts it read-only and does not invoke privileged endpoints, but the underlying socket is coarse-grained. Use the rootless Docker daemon or the CRI socket where possible.

## Reporting vulnerabilities

See [`SECURITY.md`](../../SECURITY.md) at the repo root for the responsible disclosure process. Please do not file public issues for security bugs.

## Compliance

Theoria does not currently certify against any compliance regime (SOC 2, ISO 27001, HIPAA, etc.). It provides the primitives — audit log, encryption in transit, role isolation — that customers commonly need for their own audits.
