# Docker Container Monitoring

When the agent is started with `--docker`, it gathers per-container metrics from the Docker engine socket and ships them alongside the host snapshot.

## Enabling

### CLI

```bash
npx theoria-cli agent --url … --key … --docker
```

### Systemd

Add to `/etc/theoria-agent.env`:

```
DOCKER=true
DOCKER_SOCKET=/var/run/docker.sock
```

The hardened systemd unit grants the agent's `DynamicUser` read access to `/var/run/docker.sock` via `SupplementaryGroups=docker`.

### Docker

```bash
docker run -d \
  --name theoria-agent \
  --pid=host --network=host \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e API_URL=… -e API_KEY=… -e DOCKER=true \
  ghcr.io/theoria-monitoring/agent:latest
```

### Kubernetes

See the DaemonSet manifest in [Installing the Agent](../agent/installation.md). Mount `/var/run/docker.sock` (or `/run/containerd/containerd.sock` if you're on containerd) read-only.

## What's collected

Per container, per tick:

| Field | Description |
|---|---|
| `id` | Container ID |
| `name` | Container name |
| `image` | Image reference |
| `status` | Docker high-level status (`running`, `exited`, …) |
| `state` | Low-level state (`up`, `paused`, …) |
| `cpuPercent` | CPU usage as a percentage of one core |
| `memUsage` | Memory in bytes |
| `memLimit` | Configured memory limit, bytes |
| `memPercent` | Usage / limit |
| `netRx`, `netTx` | Cumulative bytes |
| `restarts` | Restart count |

Storage: rows are inserted into the `docker_containers` hypertable, partitioned by time, with the same retention policy as `metrics` (7 days, compressed after 24 h).

## Querying

### Latest snapshot, all servers

```bash
curl https://monitor.example.com/api/docker \
  -H "Authorization: Bearer <jwt>"
```

### Latest snapshot, one server

```bash
curl https://monitor.example.com/api/docker/<serverId> \
  -H "Authorization: Bearer <jwt>"
```

For historical container metrics, query the `docker_containers` hypertable directly via Postgres if you need anything beyond the latest snapshot. A first-class history endpoint is on the roadmap.

## Alerts on container metrics

Container metrics are not yet first-class in the alert engine — alert rules target the `metrics` hypertable. To alert on container behaviour today, write a small plugin (see [Plugin Authoring](../plugins/authoring.md)) that subscribes to `metric.ingested`, evaluates container snapshots, and emits derived metrics like `container_restarts_total{name="api"}`. Then point an alert rule at that metric.

First-class container alerting is planned in the v2 roadmap.

## Performance

Each docker collection requires:

- One `GET /containers/json` call per tick
- One `GET /containers/<id>/stats?stream=false` call per running container

For a host with 50 running containers and a 5 s interval, this is ~10 Docker API calls per second. The Docker engine handles this comfortably, but if you have hundreds of containers per host, increase the agent interval to 15 s or 30 s.

## Security

Mounting the Docker socket grants **root-equivalent** access on the host. Theoria mounts it read-only, but Docker's permission model has historically been coarse: any process with read access to the socket can usually launch privileged containers.

Mitigations:

- Run the agent as a dedicated user in the `docker` group (the systemd installer does this).
- Use the rootless Docker daemon when possible.
- On Kubernetes, prefer the [container runtime's CRI socket](https://kubernetes.io/docs/concepts/architecture/cri/) over the Docker socket if available.
- Don't expose the Theoria server's API key to the agent host's other workloads.
