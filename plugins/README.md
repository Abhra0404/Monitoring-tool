# Theoria First-Party Plugins

This directory holds the five reference plugins that ship alongside Theoria.
Each is a standalone npm package that conforms to the Theoria plugin contract
(`theoria-plugin.json` manifest + a CommonJS `index.js` exporting
`async function check(config)`).

| Plugin | Transport | Runtime deps |
| --- | --- | --- |
| `theoria-plugin-redis` | TCP / TLS (custom RESP2 parser) | none |
| `theoria-plugin-nginx` | HTTP / HTTPS (stub_status) | none |
| `theoria-plugin-postgres` | TCP / TLS (libpq protocol) | `pg` |
| `theoria-plugin-mysql` | TCP (mysql protocol) | `mysql2` |
| `theoria-plugin-mongodb` | TCP / TLS (wire protocol) | `mongodb` |

## Local install for development

```bash
# link each plugin into your ~/.theoria/plugins/ so Theoria can discover it
mkdir -p ~/.theoria/plugins && cd ~/.theoria/plugins
npm init -y >/dev/null
npm install /path/to/theoria-plugin-redis
```

Then open the dashboard → Plugins, create an instance, supply host/port
credentials and click "Run now".

## Plugin return contract

```ts
interface CheckResult {
  status: "up" | "down";
  latencyMs?: number;
  detail?: Record<string, unknown>;
  metrics?: Record<string, number>;
}
```

Each check runs inside an isolated `worker_threads` Worker with a hard
CPU / memory / wall-clock budget — so a misbehaving plugin cannot take
down the Theoria server.
