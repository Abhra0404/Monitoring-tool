# Configuration

Theoria is configured by environment variables. Single-node installs additionally read first-run answers from `~/.theoria/config.json`.

## Configuration sources (precedence)

1. Process environment variables (`PORT=…`, `DATABASE_URL=…`)
2. CLI flags (`npx theoria-cli --port 8080`)
3. `~/.theoria/config.json` (set during interactive setup)
4. Built-in defaults

The server validates its environment with [zod](https://github.com/colinhacks/zod) at startup and refuses to boot with a clear error if anything is malformed.

---

## Server environment variables

### Core

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Port the Fastify server listens on |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | `production` enables stricter defaults |
| `LOG_LEVEL` | `info` | `trace` · `debug` · `info` · `warn` · `error` · `fatal` |
| `CORS_ORIGINS` | (empty) | Comma-separated origins. **Required** in production; `*` is rejected |

### Storage

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | (none) | PostgreSQL DSN. When unset, Theoria uses an in-memory store with debounced JSON backup at `~/.theoria/store.json` |
| `REDIS_URL` | (none) | Redis DSN. Required for HA. Used by the Socket.IO adapter, rate limiter, and lockout store |
| `THEORIA_DATA_DIR` | `~/.theoria` | Directory for JSON backup, plugin installs, and uploaded artifacts |

### Authentication

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | (auto-generated in dev) | HS256 signing secret. **Must be set explicitly** in production |
| `JWT_ACCESS_TTL` | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | `30d` | Refresh token lifetime |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost factor |
| `LOCKOUT_THRESHOLD` | `5` | Failed logins before account lockout |
| `LOCKOUT_DURATION_SECONDS` | `900` | Lockout duration (15 min) |

### Rate limiting

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_AUTH_PER_MIN` | `10` | Login / register attempts per IP per minute |
| `RATE_LIMIT_METRICS_PER_SEC` | `10` | Agent ingestion rate per IP per second |
| `RATE_LIMIT_HEARTBEAT_PER_MIN` | `60` | Heartbeat pings per slug per minute |

### Observability

| Variable | Default | Description |
|---|---|---|
| `SENTRY_DSN` | (none) | Optional Sentry DSN; enables error reporting |
| `SENTRY_ENVIRONMENT` | `NODE_ENV` | Environment tag |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.0` | 0.0 – 1.0 |
| `INTERNAL_METRICS_ENABLED` | `true` | Exposes Prometheus self-metrics at `/internal/metrics` |

### Email (optional)

Set these to enable per-channel SMTP notifications and password-reset email.

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | (none) | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | (none) | SMTP username |
| `SMTP_PASS` | (none) | SMTP password |
| `SMTP_FROM` | (none) | RFC 5322 From address |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (port 465) |

---

## Agent environment variables

| Variable | Equivalent flag | Default | Description |
|---|---|---|---|
| `API_URL` | `--url` | `http://localhost:4000` | Theoria server base URL |
| `API_KEY` | `--key` | (required) | Bearer token for `/metrics` |
| `SERVER_ID` | `--id` | hostname | Unique identifier per agent |
| `INTERVAL_MS` | `--interval` | `5000` | Collection interval (also accepts Go duration: `5s`, `30s`) |
| `DOCKER` | `--docker` | `false` | Enable Docker container collection |
| `DOCKER_SOCKET` | `--docker-socket` | `/var/run/docker.sock` | Docker engine socket path |

---

## Helm values

When running on Kubernetes via the bundled chart, every server variable above maps to a `config.<camelCase>` value. Example:

```yaml
config:
  nodeEnv: production
  logLevel: info
  corsOrigins: "https://monitor.example.com"

auth:
  jwtSecret: ""          # Use existingSecret in production
  existingSecret: theoria-jwt
  existingSecretKey: jwt-secret

database:
  secretName: theoria-postgres
  secretKey: url

redis:
  secretName: theoria-redis
  secretKey: url
```

See [Kubernetes (Helm)](../deployment/kubernetes-helm.md) for the full values reference.

---

## `~/.theoria/config.json`

The CLI writes a small JSON file after first-run setup:

```json
{
  "version": 2,
  "port": 4000,
  "databaseUrl": null,
  "createdAt": "2026-04-01T12:00:00.000Z"
}
```

Re-run setup with `npx theoria-cli --reset` if you need to regenerate it.

---

## Production checklist

Before exposing Theoria to the public internet, ensure:

- [ ] `JWT_SECRET` is set to a cryptographically random 32-byte hex string
- [ ] `CORS_ORIGINS` is set to the exact dashboard origin (no `*`)
- [ ] `DATABASE_URL` points at a Postgres instance with the `timescaledb` extension installed
- [ ] `REDIS_URL` is set if you run more than one server replica
- [ ] `NODE_ENV=production`
- [ ] Theoria sits behind a TLS-terminating reverse proxy (see [Reverse Proxy](../deployment/reverse-proxy.md))
- [ ] Backups of the database and `~/.theoria` are scheduled (see [Backup & Restore](../operations/backup-restore.md))
