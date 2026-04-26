# Installation

Theoria can be installed in several ways depending on your environment. All installation methods produce the same Fastify process listening on a configurable port (default `4000`).

## Prerequisites

| Component | Requirement |
|---|---|
| Node.js | ≥ 20 LTS |
| RAM | 256 MB minimum, 1 GB recommended |
| Disk | 1 GB for the in-memory + JSON deployment; 10+ GB if PostgreSQL is co-located |
| OS | Linux, macOS, or Windows for the server. Agents run on the same plus Windows Server. |

PostgreSQL (with TimescaleDB) and Redis are **optional** for single-node deployments and **required** for high availability.

---

## Option 1 — npx (fastest)

```bash
npx theoria-cli
```

The CLI walks you through first-time setup interactively and stores the result in `~/.theoria/config.json`. The dashboard is then available at `http://localhost:4000`.

To re-run setup:

```bash
npx theoria-cli --reset
```

To pin to a specific port or use an external Postgres database:

```bash
npx theoria-cli --port 8080 --database-url postgres://user:pass@host:5432/theoria
```

See the [CLI Reference](../cli-reference.md) for every flag.

---

## Option 2 — Docker

A pre-built image is published to GHCR.

```bash
docker run -d \
  --name theoria \
  -p 4000:4000 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -v theoria-data:/root/.theoria \
  ghcr.io/theoria-monitoring/theoria:latest
```

For a fully managed setup with Postgres + Redis bundled, use [`docker-compose.yml`](../../docker-compose.yml):

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d
```

See [Docker Deployment](../deployment/docker.md) for the full guide.

---

## Option 3 — Kubernetes (Helm)

```bash
helm repo add theoria https://theoria-monitoring.github.io/charts
helm repo update

helm install theoria theoria/theoria \
  --namespace observability --create-namespace \
  --set auth.jwtSecret=$(openssl rand -hex 32) \
  --set config.corsOrigins=https://monitor.example.com \
  --set database.secretName=theoria-postgres \
  --set redis.secretName=theoria-redis
```

The chart ships HA-ready defaults (2 replicas, anti-affinity, PodDisruptionBudget, hardened SecurityContext). See [Kubernetes (Helm)](../deployment/kubernetes-helm.md).

---

## Option 4 — From source

```bash
git clone https://github.com/theoria-monitoring/theoria.git
cd theoria
npm install
npm run build:client
cd server && npm install && npm run build
node dist/index.js
```

Use this if you need to develop against the server or build a custom Docker image.

---

## Installing the agent

The agent is a separate static Go binary that ships with the npm package and the platform installers.

| Platform | One-liner |
|---|---|
| Linux / macOS | `curl -fsSL https://get.theoria.io/agent.sh \| sudo sh -s -- --url https://monitor.example.com --key <API_KEY>` |
| Windows | `iwr https://get.theoria.io/agent.ps1 -useb \| iex; Install-TheoriaAgent -Url 'https://monitor.example.com' -Key '<API_KEY>'` |
| Anywhere with Node | `npx theoria-cli agent --url https://monitor.example.com --key <API_KEY>` |

See [Installing the Agent](../agent/installation.md) for service-managed installs.

---

## Verifying the install

```bash
curl http://localhost:4000/health
# {"status":"ok"}

curl http://localhost:4000/api/docs.json | jq '.info.version'
```

If both succeed, continue to the [Quickstart](quickstart.md).
