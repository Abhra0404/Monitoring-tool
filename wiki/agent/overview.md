# Agent Overview

The Theoria agent is a small, statically-linked Go binary you run on every host you want to monitor. It collects system metrics every five seconds and POSTs them as a single JSON payload to the Theoria server.

## Design goals

- **Tiny footprint** — single binary, no runtime, no dependencies. ~5 MB on disk, < 20 MB resident memory.
- **Crash-only** — never buffers, never persists; if the server is down it skips a tick.
- **Cross-platform** — Linux, macOS, Windows all from the same source tree.
- **Privileged but bounded** — runs as an unprivileged user under a service manager. Reads `/proc`, `/sys`, or platform equivalents; never writes outside its log destination.
- **Pull-free** — there is no scrape endpoint to expose. The agent only opens outbound connections.

## What it collects

Every tick (default 5 s) the agent gathers:

| Group | Fields |
|---|---|
| CPU | `cpu_usage` (%), `cpu_count` |
| Memory | `memory_total_bytes`, `memory_free_bytes`, `memory_usage_percent` |
| Disk | `disk_total_bytes`, `disk_free_bytes`, `disk_usage_percent` (root volume) |
| Network | `network_rx_bytes_per_sec`, `network_tx_bytes_per_sec` |
| Load | `load_avg_1m`, `load_avg_5m`, `load_avg_15m` (Unix only) |
| System | `system_uptime_seconds`, `platform`, `arch`, `hostname` |
| Containers (opt-in) | per-container `cpu_percent`, `mem_usage`, `mem_limit`, `mem_percent`, `net_rx`, `net_tx`, `restarts`, `state`, `image` |

Container collection is enabled with `--docker` and requires read access to `/var/run/docker.sock` (or the path passed via `--docker-socket`).

## How it talks to the server

```
POST /metrics
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "serverId": "web-1",
  "cpu": 32.4,
  "totalMem": 16777216000,
  "freeMem": 8388608000,
  "uptime": 1234567,
  "loadAvg1": 0.42,
  "loadAvg5": 0.51,
  "loadAvg15": 0.66,
  "diskTotal": 500000000000,
  "diskFree": 320000000000,
  "networkRx": 102400,
  "networkTx": 204800,
  "cpuCount": 8,
  "platform": "linux",
  "arch": "amd64",
  "hostname": "web-1",
  "timestamp": 1761515430123
}
```

`200 OK` on success. Any non-2xx triggers exponential backoff (capped at 30 minutes between attempts; the error counter is capped at 20 to avoid arithmetic overflow).

The full payload schema, including the optional `containers[]` array, is documented in [Agent Reference](reference.md).

## What it does *not* do

- It does **not** authenticate users; it has its own opaque API key.
- It does **not** open any listening port.
- It does **not** read application logs.
- It does **not** send process lists, command lines, environment variables, or file contents.

This makes the agent safe to deploy widely under most internal compliance regimes.

## When *not* to use the agent

- If your workloads already publish metrics over OpenTelemetry, point them at [`/v1/metrics`](../integrations/opentelemetry.md) instead.
- If you only need synthetic uptime checks (HTTP/TCP/Ping/DNS), the server runs those itself — no agent required.
- For Kubernetes-native deployments, run a single agent DaemonSet rather than embedding the agent into application containers.
