# Plugin authoring guide

Theoria plugins are small JavaScript / TypeScript modules that run inside
a sandboxed worker and can react to metrics, alerts, or HTTP-check
results in real time. They are intended for customer-specific logic that
doesn't belong in core (custom enrichment, niche integrations,
organisation-specific routing).

## Anatomy of a plugin

Every plugin exports a default object with a `manifest` and a `handlers`
map:

```ts
// plugins/my-enricher.ts
import type { PluginModule } from "@theoria/plugin-sdk";

export default {
  manifest: {
    name: "my-enricher",
    version: "1.0.0",
    // Events this plugin subscribes to. Unknown events are rejected by
    // the registry at install time.
    events: ["metric.ingested", "alert.fired"],
    // Optional per-event timeout in ms; defaults to 100.
    timeout: 200,
    // Declares which APIs the sandbox exposes to this plugin. Anything
    // not listed is unreachable — no filesystem, no network, no Node
    // globals.
    permissions: ["http.outbound", "kv.read", "kv.write"],
  },
  handlers: {
    async "metric.ingested"({ metric, kv, http }) {
      const tag = await kv.get(`tag:${metric.serverId}`);
      if (!tag) return;
      await http.post("https://example.com/ingest", { metric, tag });
    },
    async "alert.fired"({ alert, kv }) {
      await kv.set(`last-alert:${alert.serverId}`, alert.id);
    },
  },
} satisfies PluginModule;
```

## Installing a plugin

1. Ship the compiled JS to the server via `POST /api/plugins/install`.
2. Theoria validates the manifest (`server/src-new/modules/plugins/
   manifest.ts`) and rejects any handler that exceeds the declared
   permission set.
3. The registry loads the module inside a `worker_threads` sandbox with
   `--experimental-vm-modules`-style isolation; the handler process
   cannot reach `fs`, `child_process`, or any core Theoria module.
4. Every handler execution is wrapped in a timeout (default 100 ms,
   configurable via `manifest.timeout`). Plugins that exceed it are
   terminated and marked unhealthy.

## Available host APIs

All APIs are fully typed in `@theoria/plugin-sdk`:

- `http.get / http.post` — outbound HTTP with a 5-second timeout. Blocked
  when `http.outbound` permission is missing.
- `kv.get / kv.set / kv.delete` — per-plugin key-value store backed by
  the main store (or Redis when available).
- `log.info / log.warn / log.error` — structured logs that flow into the
  server's Pino stream tagged with the plugin name.
- `metrics.counter / metrics.gauge` — custom Prometheus metrics exposed
  under `/internal/metrics` with a `plugin` label.

## Lifecycle events

| Event              | Payload                          |
|--------------------|----------------------------------|
| `metric.ingested`  | `{ metric: MetricRecord }`       |
| `alert.fired`      | `{ alert: AlertHistoryRecord }`  |
| `alert.resolved`   | `{ alert: AlertHistoryRecord }`  |
| `check.succeeded`  | `{ check: HttpCheckResult }`     |
| `check.failed`     | `{ check: HttpCheckResult }`     |
| `server.online`    | `{ server: ServerRecord }`       |
| `server.offline`   | `{ server: ServerRecord }`       |

## Testing locally

```bash
cd server
npx vitest run src-new/modules/plugins
```

The sandbox tests use a stub registry; the unit test harness is a good
template for unit-testing your own handlers without running the full
server.

## Performance contract

Plugins run on the hot path. A plugin that routinely exceeds 50 ms per
event will be disabled automatically after 5 consecutive timeouts. Keep
work async and offload expensive operations to the plugin's own KV
store or an external queue.
