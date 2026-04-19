# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Theoria is a self-hosted system monitoring tool distributed as an npm CLI package (`theoria-cli`). It consists of four components: a CLI launcher, an Express API server, a React dashboard, and a lightweight Node.js agent that runs on monitored machines. The server uses an **in-memory data store** (not MongoDB) with JSON persistence to `~/.theoria/store.json`.

## Architecture

```
bin/theoria.js          CLI entry point (npx theoria-cli)
   ├── spawns server/src/index.js   (Express + Socket.IO on port 4000)
   │     ├── Serves REST API at /api/*
   │     ├── Serves built React client (SPA) from client/build/
   │     ├── Accepts agent metrics via POST /metrics (API key auth)
   │     └── Broadcasts metrics + alerts via Socket.IO
   └── spawns agent/theoria-agent (Go binary, when `npx theoria-cli agent`)
         └── Collects OS metrics every 5s, POSTs to /metrics

landing/                 Separate Vite+React marketing/landing page (not part of main app)
```

**Data flow:** Agent collects CPU/memory/disk/network/load → POST /metrics → server stores in memory + evaluates alert rules → Socket.IO broadcasts to dashboard → React renders charts via Recharts.

**Key design decisions:**
- No database required — `server/src/store.js` is the entire data layer (in-memory arrays with debounced JSON persistence). Metrics are NOT persisted; only users, servers, alert rules, and alert history survive restarts.
- Single-user/system-user model — `auth.middleware.js` `authenticate()` always resolves to the system user (no login required for dashboard). Agents authenticate via API key in Bearer header.
- The server serves both the API and the built React client from a single Express process on a single port.
- `global.io` is used to access the Socket.IO instance from controllers.

## Commands

### Development

```bash
# Start server directly (requires client to be pre-built)
cd server && npm start           # runs node src/index.js

# Start via CLI (the intended way — handles setup, spawns server)
npm start                        # runs node bin/theoria.js

# Start client dev server (separate process, port 3000)
cd client && npm start           # react-scripts start

# Build client for production
npm run build:client             # or: cd client && npm install && npm run build

# Start agent (for testing metric collection)
cd agent && npm start            # or: npx theoria-cli agent --url http://localhost:4000 --key <key>

# Landing page dev
cd landing && npm run dev        # Vite dev server
cd landing && npm run build      # Vite production build
cd landing && npm run lint        # ESLint
```

### Docker

```bash
docker compose up -d             # Starts MongoDB + Theoria server on port 4000
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d   # With real secret
```

### Testing

No test suites are configured. Server and agent both have `"test": "echo \"Error: no test specified\""`. Client uses react-scripts test (Jest + React Testing Library) but no test files exist yet.

## Project Structure

- **`server/src/store.js`** — The entire data layer. Exports `Users`, `Servers`, `Metrics`, `AlertRules`, `AlertHistory` objects with find/create/update/delete methods. All operate on plain JS arrays. A system user is auto-created on startup with an auto-generated API key.
- **`server/src/services/alertEngine.js`** — Evaluates alert rules against incoming metrics. Supports duration-based conditions and severity determination. Uses an in-memory `breachState` Map for tracking ongoing breaches.
- **`server/src/controllers/metrics.controller.js`** — The hot path. Receives agent payloads, upserts server status, stores individual metric data points, evaluates alerts, and emits Socket.IO events.
- **`client/src/hooks/useSocket.js`** — Single Socket.IO connection shared across all pages. Maintains `allServerMetrics` (overview) and `liveData` (filtered for selected server detail view).
- **`client/src/services/api.js`** — Axios-based API client. `REACT_APP_API_URL` env var controls base URL (empty string in production since server serves the client).
- **`client/src/AppShell.js`** — Main layout with sidebar + routed pages. Polls servers every 15 seconds alongside Socket.IO real-time updates.
- **`bin/theoria.js`** — CLI that handles first-time setup (saves config to `~/.theoria/config.json`), spawns the server process, and supports an `agent` subcommand.

## API Routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /metrics` | API Key (Bearer) | Agent metric ingestion |
| `GET /api/auth/me` | System user | Get current user + API key |
| `POST /api/auth/regenerate-key` | System user | Regenerate API key |
| `GET /api/servers` | System user | List all servers |
| `GET /api/servers/:id/metrics` | System user | Historical metrics (query: `timeRange`) |
| `GET/POST/DELETE /api/alerts/rules` | System user | Alert rule CRUD |
| `GET /api/alerts/history` | System user | Alert history |
| `GET /health` | None | Health check |

## Environment Variables

- `PORT` — Server port (default: 5000 in dev, 4000 via CLI/Docker)
- `JWT_SECRET` — Used in Docker setup (not actively used in current single-user mode)
- `CLIENT_BUILD_PATH` — Override path to client/build directory
- `REACT_APP_API_URL` — Client API base URL (empty string for production, set for separate dev server)
- Agent: `API_URL`, `API_KEY`, `SERVER_ID`, `INTERVAL_MS`

## Tech Stack

- **Server:** Express 5, Socket.IO 4, CommonJS modules
- **Client:** React 19, React Router 7, Tailwind CSS 3, Recharts, Socket.IO Client, Create React App
- **Agent:** Node.js with only axios dependency, CommonJS
- **Landing:** Vite 8, React 19, Tailwind CSS 4, Framer Motion, ES modules
- **No database** — pure in-memory with JSON file backup

## Notable Patterns

- The server has both `server/src/models/` (Mongoose-style model files from an earlier design) and `server/src/store.js` (the actual data layer). The models directory is legacy and not used.
- There is a `sever/` directory (typo) at the root — appears to be empty/unused.
- `server/src/controllers/metricsController.js` exists alongside `metrics.controller.js` — the one without the dot is likely legacy.
- The client has an empty `context/` directory — no React context providers are implemented yet.
- Metric ring buffer caps at 100,000 data points per server with a 7-day TTL.
- Alert history auto-cleans entries older than 30 days.
