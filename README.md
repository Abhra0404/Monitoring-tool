# MonitorX

Self-hosted system monitoring. One command, full dashboard.

```
npx monitorx
```

## Quick Start

### Prerequisites

- **Node.js 18+**
- **MongoDB** — local install or [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier works)

### Run it

```bash
git clone https://github.com/Abhra0404/Monitoring-tool.git
cd Monitoring-tool
npm start
```

That's it. On first run, it will:

1. Ask for your MongoDB URI and port
2. Install all dependencies automatically
3. Build the dashboard
4. Start the server and open your browser

Subsequent runs skip setup and start instantly.

### CLI Options

```bash
npx monitorx                     # Interactive setup + start
npx monitorx --port 8080         # Custom port
npx monitorx --mongo mongodb+srv://user:pass@cluster/db   # Remote MongoDB
npx monitorx --reset             # Re-run first-time setup
```

---

## Monitor a Server

On any machine you want to monitor:

```bash
git clone https://github.com/Abhra0404/Monitoring-tool.git
cd Monitoring-tool/agent
npm install
```

Create `agent/.env`:

```env
API_KEY=<your-api-key-from-settings-page>
API_URL=http://<monitorx-host>:4000
SERVER_ID=my-server-name
```

```bash
npm start
```

The agent collects CPU, memory, disk, network, and load metrics every 5 seconds.

---

## Docker

```bash
docker compose up -d
```

The dashboard will be available at `http://localhost:4000`.

Set a real JWT secret:

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d
```

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  MonitorX Dashboard                   │
│              React + Tailwind + Recharts              │
│               (served by Express)                     │
├──────────────────────────────────────────────────────┤
│                  MonitorX Server                      │
│    Express API · Socket.IO · Alert Engine · JWT       │
│                      port 4000                        │
├──────────────────────────────────────────────────────┤
│                    MongoDB                            │
│     Users · Servers · Metrics (TimeSeries) · Alerts   │
└──────────────────────────────────────────────────────┘
        ▲              ▲              ▲
        │              │              │
   ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
   │ Agent 1 │   │ Agent 2 │   │ Agent N │
   │ (node)  │   │ (node)  │   │ (node)  │
   └─────────┘   └─────────┘   └─────────┘
```

## Features

- **Real-time metrics** — CPU, memory, disk, network, load averages via WebSocket
- **Multi-server** — Monitor unlimited servers from one dashboard
- **Alert engine** — Server-side evaluation with duration-based conditions
- **Alert history** — Timeline of all fired and resolved alerts
- **Multi-tenant** — JWT auth, each user sees only their servers
- **API key auth** — Secure agent-to-server communication
- **Gauge charts** — At-a-glance CPU/memory/disk utilization
- **Time range selection** — 5m to 7d with smart downsampling
- **Auto-open browser** — Jenkins-style UX
- **Docker support** — Single `docker compose up`
- **Dark theme** — GitHub-dark inspired design

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Tailwind CSS, Recharts, Socket.IO Client |
| Backend | Express 5, Socket.IO 4, Mongoose 9 |
| Database | MongoDB with TimeSeries collections |
| Agent | Node.js (zero dependencies beyond axios) |
| CLI | Node.js builtins only (zero extra dependencies) |

## License

ISC
