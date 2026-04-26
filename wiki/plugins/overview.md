# Plugin Overview

Plugins extend Theoria with new check types, new metrics, and new event sinks — without modifying the core. They run inside Node.js `worker_threads` with a capability whitelist that limits what they can touch.

## Why plugins

- **First-class extensibility.** Add support for any system without forking Theoria.
- **Sandboxed.** A plugin cannot read your filesystem, open arbitrary sockets, or import unauthorised modules.
- **Discoverable.** The CLI installs plugins from npm; the dashboard lists installed and instance-bound plugins.
- **Per-tenant.** Plugin instances are user-scoped; one user's MongoDB plugin won't see another user's data.

## First-party plugins

Bundled in `plugins/`:

| Plugin | Type | Purpose |
|---|---|---|
| `theoria-plugin-mongodb` | server-check | Ping + connection counters + opcounters |
| `theoria-plugin-mysql` | server-check | Ping + thread + query metrics |
| `theoria-plugin-postgres` | server-check | `SELECT 1` + replication lag + active connections |
| `theoria-plugin-redis` | server-check | Ping + memory + keyspace stats |
| `theoria-plugin-nginx` | server-check | Status module scrape (active conns, requests/sec) |

Install with:

```bash
npx theoria-cli plugin install theoria-plugin-mongodb
```

The CLI npm-installs the package into `~/.theoria/plugins/` and reloads the plugin host. Confirm:

```bash
npx theoria-cli plugin list
```

## Plugin types

| Type | When it runs |
|---|---|
| `server-check` | On a fixed interval (`intervalSeconds`); typical for "is this database healthy" probes |
| `webhook` | When inbound HTTP arrives at `/api/plugins/instances/<id>/webhook` |
| `enricher` | On `metric.ingested` events; can derive new metrics from existing ones |
| `sink` | On `alert.fired` / `alert.resolved` events; e.g. push alerts to a custom system |

A single plugin can declare more than one event subscription.

## Lifecycle

1. **Install:** `theoria-cli plugin install <pkg>` writes the package into `~/.theoria/plugins/<pkg>` and validates `theoria-plugin.json`.
2. **Discover:** `GET /api/plugins` returns installed packages plus their declared metrics and config schemas.
3. **Bind:** `POST /api/plugins/instances` creates an *instance*: a (plugin, config, owner) tuple.
4. **Run:** the plugin host spawns the entrypoint inside a worker_thread; the host scheduler invokes it on the declared interval or on matching events.
5. **Toggle:** `PATCH /api/plugins/instances/<id>` enables/disables an instance without removing it.
6. **Unbind:** `DELETE /api/plugins/instances/<id>` stops the instance and removes its config.
7. **Uninstall:** `POST /api/plugins/uninstall/<pluginName>` removes the package and any remaining instances.

## Sandbox

Plugins run in a `worker_threads` Worker. They receive a deliberately small global API surface and can access only the capabilities they request in `theoria-plugin.json`:

| Capability | Methods |
|---|---|
| `http.outbound` | `http.get(url, options)`, `http.post(url, body, options)` (5 s timeout) |
| `kv.read` / `kv.write` / `kv.delete` | Per-instance key-value store; persisted to the same DB as Theoria |
| `log.info` / `log.warn` / `log.error` | Structured logs tagged with `pluginName` and `instanceId` |
| `metrics.counter` / `metrics.gauge` | Publish custom metrics into the `metrics` hypertable |

Anything not in the capability list is unavailable. Plugins cannot:

- `require("fs")`, `require("child_process")`, etc. — the worker's `require` resolver is replaced.
- Open raw TCP/UDP sockets (only the `http` capability is exposed).
- Read process environment variables.
- Import other plugins' code.

There is a per-tick CPU timeout (`timeoutMs`, default 100 ms; configurable per plugin). Exceeding it kills the worker and logs an error.

## Roadmap

- **Plugin signing** to verify integrity at install time.
- **Per-rule routing for `sink` plugins** (only deliver `critical` to PagerDuty bridge, etc.).
- **Marketplace** for community plugins with star ratings and version history.

See [Plugin Authoring](authoring.md) for a hands-on tutorial and [Manifest Reference](manifest-reference.md) for the full schema.
