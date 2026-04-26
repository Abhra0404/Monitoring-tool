# Plugin Authoring Guide

This walkthrough builds a complete plugin from scratch — a RabbitMQ check that polls the management API every minute and emits queue depth and consumer count metrics.

## 1. Scaffold the package

```bash
mkdir theoria-plugin-rabbitmq && cd $_
npm init -y
```

Edit `package.json` so the entrypoint is `index.js` and add Theoria's plugin marker:

```json
{
  "name": "theoria-plugin-rabbitmq",
  "version": "0.1.0",
  "main": "index.js",
  "keywords": ["theoria-plugin"],
  "license": "Apache-2.0"
}
```

The `theoria-plugin` keyword is what the dashboard uses to discover the package on npm.

## 2. Write the manifest

Create `theoria-plugin.json`:

```json
{
  "name": "theoria-plugin-rabbitmq",
  "displayName": "RabbitMQ",
  "version": "0.1.0",
  "type": "server-check",
  "entry": "index.js",
  "description": "Polls the RabbitMQ management API for per-queue depth and consumer counts.",
  "author": "Acme Inc.",
  "icon": "rabbit",
  "intervalSeconds": 60,
  "timeoutMs": 5000,
  "metrics": [
    { "name": "rabbitmq_queue_depth",     "description": "Messages ready in the queue" },
    { "name": "rabbitmq_queue_consumers", "description": "Consumers attached to the queue" }
  ],
  "configSchema": {
    "type": "object",
    "required": ["url", "username", "password"],
    "properties": {
      "url":      { "type": "string", "format": "uri",      "description": "Management API base URL (e.g. http://rabbit:15672)" },
      "username": { "type": "string",                       "description": "Management user" },
      "password": { "type": "string", "format": "password", "description": "Management password" },
      "vhost":    { "type": "string", "default": "/",       "description": "Virtual host" }
    }
  }
}
```

## 3. Implement the handler

Create `index.js`:

```js
// Theoria injects: ctx.config (the bound config), and the capability APIs the
// manifest declared in `permissions` (see Manifest Reference).

module.exports = async function ({ config, http, log, metrics }) {
  const { url, username, password, vhost = "/" } = config;
  const auth = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const encodedVhost = encodeURIComponent(vhost);
  const res = await http.get(`${url}/api/queues/${encodedVhost}`, {
    headers: { Authorization: auth },
  });

  if (res.status !== 200) {
    log.warn("RabbitMQ management API returned " + res.status);
    return;
  }

  for (const q of res.body) {
    metrics.gauge("rabbitmq_queue_depth", q.messages_ready, {
      queue: q.name,
      vhost,
    });
    metrics.gauge("rabbitmq_queue_consumers", q.consumers, {
      queue: q.name,
      vhost,
    });
  }
};
```

That's the entire plugin: ~25 lines. The host calls this function every `intervalSeconds`, with `ctx.config` populated from the bound instance.

## 4. Test locally

Theoria provides a test harness in `theoria-cli`:

```bash
npx theoria-cli plugin test ./theoria-plugin-rabbitmq \
  --config '{"url":"http://localhost:15672","username":"guest","password":"guest"}'
```

This loads the plugin, validates `configSchema` against `--config`, and runs one tick with capability stubs that print every API call to stdout.

## 5. Publish

```bash
npm publish --access public
```

End users install with:

```bash
npx theoria-cli plugin install theoria-plugin-rabbitmq
```

…then bind an instance via the dashboard or:

```bash
curl -X POST https://monitor.example.com/api/plugins/instances \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "pluginName": "theoria-plugin-rabbitmq",
    "name": "Production RabbitMQ",
    "config": {
      "url": "http://rabbit.internal:15672",
      "username": "monitor",
      "password": "…",
      "vhost": "/prod"
    }
  }'
```

## Event-driven plugins

Replace the default tick handler with named subscriptions:

```js
module.exports = {
  async ["alert.fired"]({ alert, http, log }) {
    log.info(`Forwarding alert ${alert.ruleName}`);
    await http.post("https://chatops.acme.com/incoming", alert);
  },

  async ["alert.resolved"]({ alert, http }) {
    await http.post("https://chatops.acme.com/incoming", { ...alert, resolved: true });
  },
};
```

The subscription names match the [event taxonomy](../api/websockets.md). Mix and match — the same plugin can subscribe to several events.

## Using the KV store

The `kv` capability provides a simple per-instance namespace for state:

```js
module.exports = async function ({ kv, metrics, http, config }) {
  const lastSeen = (await kv.read("last_seen")) || 0;
  const events = await fetchEventsSince(lastSeen, config, http);

  for (const e of events) {
    metrics.counter("vendor_events_total", 1, { type: e.type });
  }

  if (events.length > 0) {
    await kv.write("last_seen", events[events.length - 1].timestamp);
  }
};
```

The KV store is namespaced per `(pluginName, instanceId)`. Keys are strings; values are JSON-serialisable.

## Logging conventions

- `log.info` for routine progress messages
- `log.warn` for recoverable issues (transient HTTP errors, malformed responses)
- `log.error` for fatal issues that abort the tick

Logs are emitted as structured JSON with `pluginName`, `instanceId`, and a correlation id. They appear in the Theoria server logs and can be tailed with:

```bash
journalctl -u theoria | grep '"pluginName":"theoria-plugin-rabbitmq"'
```

## Releasing new versions

The plugin host caches the loaded module by `(pluginName, version)`. When a user upgrades via `theoria-cli plugin install <pkg>@<new-version>`, the host:

1. Stops every running instance.
2. Replaces the on-disk package.
3. Validates new configs against the new `configSchema`.
4. Restarts instances with backward-compatible configs.
5. Marks any incompatible instances `disabled` and logs a warning.

Backward incompatibility = removing required fields, changing field types, or changing capability requirements.
