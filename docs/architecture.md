# Architecture

Theoria is a four-tier system: agents collect metrics and ship them to a
Fastify API, which broadcasts over Socket.IO to the React dashboard and
persists to TimescaleDB. Redis is optional but required for horizontal
scaling.

```mermaid
flowchart LR
    subgraph Agents["Agent fleet"]
        A1[theoria-agent<br/>linux]
        A2[theoria-agent<br/>darwin]
        A3[theoria-agent<br/>windows]
    end

    subgraph Server["Theoria server (Fastify, horizontally scalable)"]
        API[HTTP + WebSocket<br/>entrypoint]
        Ingest[Metrics ingest]
        Alerts[Alert engine]
        Checks[Synthetic checks<br/>HTTP / TCP / Ping / DNS]
        Plugins[Plugin sandbox]
        API --> Ingest
        API --> Alerts
        API --> Checks
        API --> Plugins
    end

    subgraph Data["State"]
        PG[(TimescaleDB)]
        RED[(Redis)]
        FS[(~/.theoria/store.json)]
    end

    subgraph Clients
        UI[React dashboard]
        CLI[theoria-cli]
        PROM[Prometheus scrape]
        SENT[Sentry]
    end

    A1 & A2 & A3 -->|POST /metrics| API
    Ingest --> PG
    Alerts <--> RED
    API <--> RED
    Ingest --> FS
    API -->|Socket.IO| UI
    CLI --> API
    PROM -->|GET /internal/metrics| API
    API -->|errors| SENT
```

## Request lifecycle — `POST /metrics`

1. `@fastify/helmet` applies security headers.
2. Fastify generates (or accepts) a correlation ID in `x-request-id`.
3. `app.authenticateApiKey` validates the bearer token.
4. `metrics.controller` writes to the in-memory store **and** to
   TimescaleDB (if `DATABASE_URL`).
5. The alert engine evaluates rules synchronously against the new data;
   breach state is mirrored to Redis when available.
6. Socket.IO broadcasts `metrics:update` to every connected dashboard,
   via the Redis adapter if configured.
7. `/internal/metrics` counters are bumped for Prometheus to scrape.

## Single-node vs. HA

| Concern            | Single-node          | HA (multi-replica)            |
|--------------------|----------------------|-------------------------------|
| Storage            | JSON file            | TimescaleDB                   |
| Socket.IO fan-out  | in-memory            | `@socket.io/redis-adapter`    |
| Rate-limit         | local map            | Redis (shared counter)        |
| Account lockout    | local map            | Redis keys with TTL           |
| Alert breach state | local map            | Redis mirror + rehydrate      |

Enable HA by setting `DATABASE_URL` and `REDIS_URL` — no code changes
required.
