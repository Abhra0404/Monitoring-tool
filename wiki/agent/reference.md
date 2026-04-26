# Agent Reference

Complete reference for the Theoria agent's CLI flags, environment variables, and metric payload schema.

## Invocation

```
theoria-agent [flags]
```

## Flags

| Flag | Env var | Default | Description |
|---|---|---|---|
| `--url` | `API_URL` | `http://localhost:4000` | Theoria server base URL |
| `--key` | `API_KEY` | *required* | Bearer token. Get one from **Settings → API Keys** |
| `--id` | `SERVER_ID` | hostname | Unique identifier for this host. Pin to a stable value across reboots |
| `--interval` | `INTERVAL_MS` | `5s` | Collection interval. Accepts `5000` (ms) or Go duration strings (`5s`, `1m30s`) |
| `--docker` | `DOCKER` | `false` | Enable Docker container collection |
| `--docker-socket` | `DOCKER_SOCKET` | `/var/run/docker.sock` | Path to the Docker engine socket |
| `--version` | — | — | Print the version string and exit |
| `--help` | — | — | Print usage |

Environment variables take precedence only when the corresponding flag is **not** passed.

---

## Payload schema

Agents POST a single JSON document to `/metrics` per tick.

```ts
interface AgentPayload {
  serverId: string;          // required, unique per agent per user
  cpu: number;               // 0–100
  totalMem: number;          // bytes
  freeMem: number;           // bytes
  uptime: number;            // seconds
  loadAvg1: number;          // unix only; 0 on Windows
  loadAvg5: number;
  loadAvg15: number;
  diskTotal: number;         // bytes (root volume)
  diskFree: number;          // bytes
  networkRx: number;         // bytes/sec
  networkTx: number;         // bytes/sec
  cpuCount: number;
  platform: "linux" | "darwin" | "windows";
  arch: "amd64" | "arm64";
  hostname: string;
  timestamp: number;         // ms since epoch
  containers?: Container[];  // present when --docker is enabled
}

interface Container {
  id: string;
  name: string;
  image: string;
  status: string;            // "running", "exited", …
  state: string;             // "up", "paused", …
  cpuPercent: number;
  memUsage: number;          // bytes
  memLimit: number;          // bytes
  memPercent: number;
  netRx: number;             // bytes
  netTx: number;             // bytes
  restarts: number;
}
```

The server expands these fields into individual rows in the `metrics` and `docker_containers` hypertables.

## Metric names

These are the names the alert engine sees. Use them as `metricName` in `/api/alerts/rules`.

| Source field | Metric name |
|---|---|
| `cpu` | `cpu_usage` |
| `totalMem` | `memory_total_bytes` |
| `freeMem` | `memory_free_bytes` |
| (computed) | `memory_usage_percent` |
| `uptime` | `system_uptime_seconds` |
| `loadAvg1` | `load_avg_1m` |
| `loadAvg5` | `load_avg_5m` |
| `loadAvg15` | `load_avg_15m` |
| `diskTotal` | `disk_total_bytes` |
| `diskFree` | `disk_free_bytes` |
| (computed) | `disk_usage_percent` |
| `networkRx` | `network_rx_bytes_per_sec` |
| `networkTx` | `network_tx_bytes_per_sec` |

Container metrics are stored separately in `docker_containers`; alerts on container state are evaluated by the [Docker integration](../integrations/docker.md).

---

## Behaviour

### Collection loop

The agent ticks on a monotonic timer, not on `time.Now()`. A wall-clock jump (NTP correction, sleep/wake on a laptop) does not produce duplicate or skipped samples.

### Backoff

On any error from `POST /metrics` the agent doubles its sleep up to a 30-minute cap. The error count is bounded at 20 to avoid arithmetic overflow. As soon as a single request succeeds the backoff resets to the baseline interval.

### Authentication

The agent presents `Authorization: Bearer <API_KEY>`. The server compares using a constant-time function and rate-limits to 10 ingest requests per second per source IP. There is no other handshake — connection failures retry on the next tick.

### Resource usage

Typical figures on a quiet Linux server:

| Metric | Value |
|---|---|
| Resident memory | 12 – 18 MB |
| CPU | < 0.5% |
| Disk I/O | None (no on-disk state) |
| Outbound bandwidth | ~3 KB / tick (≈ 600 B/s at default 5 s) |

Container collection adds proportional overhead per container (one Docker API call per snapshot).

### Logs

Logs go to stdout in plain text by default. Under systemd they're captured by the journal; under launchd they're routed to the `StandardOutPath`/`StandardErrorPath` declared in the plist; under Windows Service they go to the Application event log under source `TheoriaAgent`.

---

## Building from source

```bash
cd agent
make build      # current platform
make all        # cross-compile for linux/darwin/windows × amd64/arm64
```

Output binaries are written to `agent/bin/`. The Makefile target `make release` produces stripped, static binaries suitable for redistribution.

## Versioning

The agent embeds a build-time version string injected via `-ldflags "-X main.version=$VERSION"`. Print it with `theoria-agent --version`. The server logs the version of every connecting agent in its access logs and exposes the most recent version per host on the `/api/servers/:id` endpoint.
