# WebSockets

Theoria streams live updates to the dashboard over a single Socket.IO connection. You can use the same channel from your own tools.

## Endpoint

```
GET wss://monitor.example.com/socket.io/?EIO=4&transport=websocket
```

Path is `/socket.io` (the Socket.IO default). HTTP long-poll is enabled as a fallback for environments that strip WebSockets.

## Authentication

Socket.IO clients must present the access token at handshake time:

```ts
import { io } from "socket.io-client";

const socket = io("https://monitor.example.com", {
  transports: ["websocket"],
  auth: { token: accessToken },   // JWT
});
```

The server validates the token in the `connection` middleware. Invalid or expired tokens are disconnected with reason `Unauthorized`.

## Rooms

Each socket joins exactly one room: `user:<userId>`. Events are scoped to that room so you only receive data your account owns. Multi-tenant deployments rely on this isolation rather than per-event filtering.

In HA deployments the Socket.IO Redis adapter (`@socket.io/redis-adapter`) replicates rooms across all server replicas; you don't need sticky sessions on your load balancer.

## Event taxonomy

| Event | Direction | Payload | When |
|---|---|---|---|
| `metric:update` | server → client | `{ serverId, snapshot, metrics: {...} }` | Agent posts to `/metrics` |
| `server:online` | server → client | `{ serverId, lastSeen }` | First metric after offline gap |
| `server:offline` | server → client | `{ serverId, lastSeen }` | No heartbeat for > 60 s |
| `alert:fired` | server → client | `AlertHistory record` | Rule crosses threshold for `durationMinutes` |
| `alert:resolved` | server → client | `AlertHistory record + duration` | Metric returns to safe range |
| `check:result` | server → client | `{ checkId, kind, status, latency, error? }` | Synthetic check completes |
| `incident:update` | server → client | `{ incident, latestUpdate }` | Operator posts new update |
| `pipeline:update` | server → client | `Pipeline record` | CI webhook delivered |
| `plugin:event` | server → client | `{ pluginName, kind, payload }` | First-party event from a plugin |

There are no client → server events in the public taxonomy. Mutations always go through the REST API; the WebSocket is read-only.

## Example consumer

```ts
import { io } from "socket.io-client";

const socket = io("https://monitor.example.com", {
  transports: ["websocket"],
  auth: { token: process.env.THEORIA_JWT },
});

socket.on("connect", () => console.log("Connected:", socket.id));

socket.on("metric:update", ({ serverId, snapshot }) => {
  console.log(`[${serverId}] CPU=${snapshot.cpu}%`);
});

socket.on("alert:fired", (alert) => {
  console.warn(`🔥 ${alert.severity.toUpperCase()} ${alert.ruleName}: ${alert.message}`);
});

socket.on("disconnect", (reason) => console.log("Bye:", reason));
```

## Backpressure

The server caps each connected client at 256 queued events. If a slow consumer exceeds the cap, older events are dropped silently and a `dropped` count is included in the next emitted event. For most dashboards this is invisible; if you build a long-running consumer, treat the stream as best-effort and reconcile with `/api/events` periodically.

## When to use WebSockets vs `/api/events`

| Use case | Use |
|---|---|
| Live dashboard widgets | WebSocket |
| Backfilling a UI on first load | `/api/events?since=…` |
| Async pipelines, queues, alerting bridges | `/api/events?cursor=…` |
| Replaying history | `/api/events?cursor=&limit=500` (pagination) |

Socket.IO is the lowest-latency path; `/api/events` is the durable one. The dashboard combines both: it hydrates from REST on mount, then attaches the WebSocket for live updates.
