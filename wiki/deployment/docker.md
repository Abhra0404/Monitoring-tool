# Deploying with Docker

Theoria publishes a multi-arch (amd64, arm64) image to GitHub Container Registry:

```
ghcr.io/theoria-monitoring/theoria:latest
ghcr.io/theoria-monitoring/theoria:<version>
```

## Quick start

```bash
docker run -d --name theoria \
  -p 4000:4000 \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -v theoria-data:/home/node/.theoria \
  ghcr.io/theoria-monitoring/theoria:latest
```

This runs Theoria with its built-in fallback store (in-memory + JSON snapshot at `/home/node/.theoria/store.json`). Suitable for evaluation and small homelabs; not suitable for production.

## Production: docker-compose

`docker-compose.yml` at the repo root provisions Theoria + PostgreSQL/TimescaleDB + Redis:

```yaml
version: "3.9"

services:
  postgres:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_USER: theoria
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: theoria
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U theoria"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]
    volumes:
      - redisdata:/data

  theoria:
    image: ghcr.io/theoria-monitoring/theoria:latest
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_started }
    environment:
      NODE_ENV: production
      PORT: 4000
      JWT_SECRET: ${JWT_SECRET}
      DATABASE_URL: postgres://theoria:${POSTGRES_PASSWORD}@postgres:5432/theoria
      REDIS_URL:    redis://:${REDIS_PASSWORD}@redis:6379
      CORS_ORIGINS: https://monitor.example.com
    ports:
      - "4000:4000"
    volumes:
      - theoria-data:/home/node/.theoria
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
  theoria-data:
```

Bring it up:

```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 16)
export REDIS_PASSWORD=$(openssl rand -hex 16)
export JWT_SECRET=$(openssl rand -hex 32)
docker compose up -d
```

Front it with a reverse proxy (see [Reverse Proxy](reverse-proxy.md)) for TLS.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `4000` | Server listen port |
| `JWT_SECRET` | yes | — | Token signing key; rotate via [runbook](../operations/runbook.md) |
| `DATABASE_URL` | recommended | — | PostgreSQL DSN; falls back to in-memory store if unset |
| `REDIS_URL` | for HA | — | Required for multi-replica deployments |
| `CORS_ORIGINS` | yes (in prod) | — | Comma-separated list of allowed origins |
| `NODE_ENV` | recommended | `production` | Disables verbose error responses |
| `SENTRY_DSN` | optional | — | Enables error reporting |
| `LOG_LEVEL` | optional | `info` | Pino log level |
| `INTERNAL_METRICS_TOKEN` | optional | — | Bearer token required for `/internal/metrics` |

## Volumes

| Path | Purpose |
|---|---|
| `/home/node/.theoria` | Config, fallback JSON store, plugin install dir |

If you use `DATABASE_URL`, the volume only holds plugin packages and config — but you should still persist it so plugins survive container recreation.

## Image hardening

The default image:

- Runs as non-root UID 1001 (`node` user)
- Has no shell (distroless variant available as `theoria:<version>-distroless`)
- Drops all capabilities

If you need to mount the Docker socket for the bundled agent (rare — typically the agent runs separately), grant only `--group-add docker`.

## Health probes

```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--spider", "http://localhost:4000/health"]
  interval: 10s
  timeout: 3s
  retries: 3
  start_period: 30s
```

`/health` returns 200 once the server is accepting connections; `/health?deep=1` additionally probes Postgres and Redis.

## Upgrades

```bash
docker compose pull theoria
docker compose up -d theoria
```

The container runs Drizzle migrations on startup; downtime is the time it takes to apply pending migrations (usually <2 s for typical schema changes). For zero-downtime upgrades, use the [Helm chart](kubernetes-helm.md).

## Backups

See [Backup & Restore](../operations/backup-restore.md). The short version:

```bash
docker exec theoria-postgres-1 pg_dump -U theoria theoria \
  | gzip > theoria-$(date +%F).sql.gz
```
