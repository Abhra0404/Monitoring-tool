# Components

This page describes each major component of the Theoria codebase, where it lives, and what it owns.

## Repository layout

```
.
├── bin/theoria.js              CLI entry point (npx theoria-cli)
├── server/                     Fastify server + REST API + Socket.IO
│   └── src-new/
│       ├── app.ts              App factory, plugin registration order
│       ├── index.ts            Production entrypoint (.listen)
│       ├── config.ts           Zod env schema
│       ├── modules/            One folder per API surface (18 modules)
│       ├── plugins/            Fastify plugins (auth, db, redis, socketio…)
│       ├── db/                 Drizzle schema + migrations
│       ├── store/              In-memory fallback store
│       └── shared/             Shared TypeScript types
├── client/                     React 19 dashboard (Vite build)
│   └── src/
│       ├── App.tsx
│       ├── AppShell.tsx        Sidebar + routing
│       ├── pages/              19 route components
│       ├── components/         Reusable UI
│       ├── hooks/useSocket.ts  Single Socket.IO connection
│       ├── stores/             Zustand stores (auth, socket, theme)
│       └── services/api.ts     Axios client
├── agent/                      Go agent
│   ├── cmd/agent/main.go
│   └── internal/collector/     Platform-specific metric collection
├── plugins/                    First-party plugins (mongodb, mysql, redis…)
├── charts/theoria/             Helm chart
├── deploy/                     Native installers (systemd, launchd, .ps1)
├── docs/                       Engineering docs (architecture, runbook)
├── wiki/                       This documentation
└── landing/                    Marketing site (Vite + React)
```

## Server (`server/`)

The server is built with **Fastify 5** and **TypeScript 5**, using ES modules. It is a single OS process that owns:

- HTTP and WebSocket listeners
- All API modules (`modules/<domain>/routes.ts`)
- Synthetic check schedulers (HTTP, TCP, Ping, DNS) running in-process via `setInterval`
- Plugin host (Node.js `worker_threads` with capability sandbox)
- Alert engine with in-memory breach state
- Static delivery of the React dashboard

Module list (each contributes a route prefix):

| Module | Prefix | Purpose |
|---|---|---|
| `auth` | `/api/auth` | Register, login, refresh, regenerate-key |
| `metrics` | `/metrics` | Agent ingestion |
| `servers` | `/api/servers` | Server CRUD + history |
| `alerts` | `/api/alerts` | Rules + history + active count |
| `http-checks`, `tcp-checks`, `ping-checks`, `dns-checks` | `/api/<kind>-checks` | Synthetic CRUD |
| `heartbeats` | `/api/heartbeats` + `/heartbeats/ping/:slug` | Cron monitors |
| `notifications` | `/api/notifications` | Channels + test |
| `incidents` | `/api/incidents` | State machine + updates |
| `status-page` | `/`, `/api/status-page` | Public status page + config |
| `events` | `/api/events` | Cursor-paginated unified timeline |
| `pipelines` | `/api/pipelines` | CI/CD webhook ingest |
| `docker` | `/api/docker` | Container snapshots |
| `plugins` | `/api/plugins` | Install + instances |
| `otlp` | `/v1/metrics` | OpenTelemetry HTTP/JSON |

## Client (`client/`)

React 19 SPA built with Vite. State is split between:

- **Zustand stores** (`stores/`) for global session state (auth, theme, socket cache).
- **TanStack Query** for server data with `staleTime` tuned per route.
- **Socket.IO client** for real-time updates, bound through `useSocket()`.

The build output is copied into `client/build/` and served by the Fastify server using `@fastify/static`. The client is therefore zero-deploy: there is no separate static host to manage.

## Agent (`agent/`)

A Go 1.25 binary, ~5 MB, with no runtime dependencies. Cross-compiled for `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`, and `windows/amd64`.

Key files:

- `cmd/agent/main.go` — flag parsing, signal handling, main collection loop with exponential backoff
- `internal/collector/cpu_*.go` — per-OS CPU collection (`mach_host_self` on Darwin, `/proc/stat` on Linux, PDH on Windows)
- `internal/collector/disk_unix.go` / `disk_windows.go` — `statvfs` vs `GetDiskFreeSpaceEx`
- `internal/collector/system.go` — uptime, load avg, memory
- `internal/collector/docker.go` — optional container metrics over the Docker socket

The agent batches one snapshot per interval into a single JSON payload and POSTs it to `/metrics`. On failure it retries with exponential backoff (capped at 30 minutes) and never buffers more than one snapshot — by design, the agent prefers gaps to memory growth.

## Plugins (`plugins/`)

Plugins are npm packages installed into `~/.theoria/plugins`. Each declares a `theoria-plugin.json` manifest and exports a handler that subscribes to lifecycle events (`metric.ingested`, `alert.fired`, etc.).

Plugins run inside Node.js `worker_threads` with a capability whitelist (`http.outbound`, `kv.read`, `metrics.gauge`, …). They have a per-tick timeout and can publish their own custom metrics back into Theoria.

See [Plugin Overview](../plugins/overview.md).

## Helm chart (`charts/theoria/`)

A production-grade Helm chart with:

- 2 replica default with `autoscaling` block
- Pod anti-affinity across nodes
- PodDisruptionBudget (`minAvailable: 1`)
- Hardened SecurityContext (non-root UID 1001, read-only filesystem, no privilege escalation)
- 1 GiB PVC for `~/.theoria` when `DATABASE_URL` is unset
- ServiceMonitor template for Prometheus Operator
- All env values mappable from `config.*`, `auth.*`, `database.*`, `redis.*`

## CLI (`bin/theoria.js`)

The CLI is the user-facing entry point. It performs first-time setup, spawns the server process, and supports an `agent` subcommand that downloads/extracts the Go binary if needed and runs it. See the [CLI Reference](../cli-reference.md).
