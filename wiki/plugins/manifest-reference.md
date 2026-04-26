# Plugin Manifest Reference

Every plugin ships a `theoria-plugin.json` file at the package root. This is the canonical schema.

## Schema

```jsonc
{
  // Identity
  "name":        "string",            // npm package name; lowercase with hyphens
  "displayName": "string",            // human-friendly label shown in the dashboard
  "version":     "string",            // semver
  "description": "string",
  "author":      "string",
  "icon":        "string",            // lucide-react icon name

  // Behaviour
  "type":            "server-check | webhook | enricher | sink",
  "entry":           "string",        // entrypoint file relative to package root
  "intervalSeconds": 60,              // for type=server-check
  "timeoutMs":       100,             // per-tick CPU budget; default 100

  // Capabilities (whitelist)
  "permissions": [
    "http.outbound",
    "kv.read", "kv.write", "kv.delete",
    "log.info", "log.warn", "log.error",
    "metrics.counter", "metrics.gauge"
  ],

  // Metric catalogue
  "metrics": [
    {
      "name":        "string",        // metric name as written via metrics.gauge / counter
      "description": "string",
      "unit":        "string"         // optional: "ms", "bytes", "percent", …
    }
  ],

  // Config schema (subset of JSON Schema 2020-12)
  "configSchema": {
    "type":     "object",
    "required": ["field_a"],
    "properties": {
      "field_a": {
        "type":        "string | number | boolean | object",
        "format":      "uri | password | email",
        "default":     "any",
        "description": "string",
        "enum":        ["…"]
      }
    }
  }
}
```

## Field reference

### `name` *(required)*

Must match the npm package name. The plugin host uses this as the on-disk directory name and as the lookup key when binding instances.

### `displayName`

Shown in the dashboard's plugin picker. Falls back to `name` if absent.

### `version` *(required)*

Semver. Used for cache invalidation and upgrade detection.

### `type` *(required)*

Determines how the plugin host invokes the plugin:

| Type | Invocation |
|---|---|
| `server-check` | Default `module.exports` function on `intervalSeconds` |
| `webhook` | Default `module.exports` function on inbound `POST /api/plugins/instances/<id>/webhook` |
| `enricher` | `module.exports["metric.ingested"]` for each metric |
| `sink` | `module.exports["alert.fired"]` and `module.exports["alert.resolved"]` |

A plugin can be more than one type by exporting both a default function and named subscriptions.

### `entry` *(required)*

Path to the entrypoint, relative to the package root. Defaults to `index.js`. The file must export either:

- A default `async function (ctx)` for tick-driven plugins, or
- An object with named subscription handlers for event-driven plugins.

### `intervalSeconds`

For `server-check` plugins. Minimum `5`, maximum `86400` (1 day). Theoria de-duplicates concurrent ticks per instance.

### `timeoutMs`

Per-tick CPU budget. Default `100`, maximum `30000`. Exceeding the budget terminates the worker for that tick and emits a `plugin.timeout` event in the host logs.

### `permissions`

Whitelist of capabilities the plugin can use. Anything not in this list is unavailable inside the worker. The dashboard surfaces this list to users at install time so they can audit what they're enabling.

### `metrics`

Catalogue of metric names this plugin will publish. Used by the dashboard to suggest alert rule targets and by the metric explorer to label values.

If a plugin emits a metric not in this catalogue, the value is still accepted but a warning is logged.

### `configSchema`

A JSON Schema subset that validates per-instance config. Supported:

- `type`: `object`, `string`, `number`, `boolean`, `array`
- `required`: array of field names
- `properties`: per-field schema
- `format`: `uri`, `password`, `email` (the dashboard renders `password` fields as masked inputs)
- `default`: value applied if omitted in the request
- `description`: shown as helper text in the dashboard form
- `enum`: restricts a field to a fixed set of values

Unsupported features include `$ref`, `oneOf`, conditional schemas, and pattern validation. Keep schemas flat — they are user-facing forms, not contract validations.

## Example: minimal

```json
{
  "name": "theoria-plugin-uptime-com",
  "displayName": "Uptime.com Bridge",
  "version": "1.0.0",
  "type": "sink",
  "entry": "index.js",
  "permissions": ["http.outbound", "log.info", "log.error"],
  "configSchema": {
    "type": "object",
    "required": ["apiKey"],
    "properties": {
      "apiKey": { "type": "string", "format": "password" }
    }
  }
}
```

## Example: comprehensive

See [`plugins/theoria-plugin-mongodb/theoria-plugin.json`](../../plugins/theoria-plugin-mongodb/theoria-plugin.json) for the canonical full-featured example.

## Validation errors

`POST /api/plugins/install` rejects packages whose manifest:

- Is missing required fields (`name`, `version`, `type`, `entry`).
- Declares a `permission` value not in the supported set.
- Declares a `type` that doesn't match the exported handler shape.
- Has a `configSchema` that fails JSON-Schema-meta validation.

The error response includes a `details` array with one message per problem.
