# Metrics & Time-Series

Theoria stores all numeric observations in a single hypertable, `metrics`, partitioned by time.

## Sources

| Source | Endpoint | Frequency | Examples |
|---|---|---|---|
| Theoria agent | `POST /metrics` | Every 5 s | `cpu_usage`, `memory_usage_percent` |
| OpenTelemetry sender | `POST /v1/metrics` | Per push | Prometheus gauge / sum / histogram |
| Plugins | internal SDK | Plugin-defined | `mongo_current_connections`, `redis_used_memory` |

Every observation is normalised into a row of:

```ts
{ time, userId, serverId, name, value, labels }
```

`labels` is a JSONB blob — use it freely for high-cardinality dimensions like mount points, container names, or queue names.

## Querying history

```http
GET /api/servers/web-1/metrics?timeRange=24h
Authorization: Bearer <jwt>
```

`timeRange` accepts `5m`, `15m`, `1h`, `6h`, `24h`, `7d`. The server downsamples server-side: `5m` returns raw 5 s points, `7d` returns 1-minute buckets. Response shape:

```json
{
  "serverId": "web-1",
  "from": "2026-04-25T12:00:00.000Z",
  "to":   "2026-04-26T12:00:00.000Z",
  "metrics": {
    "cpu_usage":             [ { "t": 1761516000000, "v": 32.4 }, … ],
    "memory_usage_percent":  [ … ],
    "disk_usage_percent":    [ … ],
    "network_rx_bytes_per_sec": [ … ],
    "network_tx_bytes_per_sec": [ … ]
  }
}
```

## Custom metrics

Send via OpenTelemetry HTTP/JSON:

```bash
curl -X POST https://monitor.example.com/v1/metrics \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceMetrics": [{
      "resource": { "attributes": [{ "key": "service.name", "value": { "stringValue": "checkout" } }] },
      "scopeMetrics": [{
        "metrics": [{
          "name": "checkout.orders.completed",
          "sum": {
            "dataPoints": [{ "asInt": "42", "timeUnixNano": "1761516000000000000" }],
            "aggregationTemporality": 2,
            "isMonotonic": true
          }
        }]
      }]
    }]
  }'
```

The server flattens OTLP gauges, sums, and histograms into rows in the `metrics` table with `serverId = service.name` and `labels = {…attributes…}`.

## Plugin-emitted metrics

Plugins publish their own metrics via the `metrics` capability:

```js
metrics.gauge("mongo_current_connections", value, { instance: "primary" });
```

These are stored under `serverId = <plugin-instance-id>` and tagged with `pluginName` in `labels`.

## Retention

| Tier | Window |
|---|---|
| Raw data | 7 days (configurable via `TIMESCALE_METRICS_RETENTION`) |
| Compressed chunks | After 24 hours |
| Beyond retention | Dropped; export with `pg_dump` if you need cold storage |

In single-node mode without `DATABASE_URL`, retention is enforced by capping arrays at 100 000 points per server.

## Anomaly detection (preview)

The anomaly detector uses Welford's online variance algorithm to compute a rolling z-score per `(serverId, metricName)`. When `|z| > 3.0` for a configurable number of consecutive samples, an `alert:fired` event is emitted with severity `info` and rule_name `anomaly:<metric>`. Disable with `ANOMALY_DETECTION_ENABLED=false`.

## Choosing what to alert on

Most teams alert on the following metrics with these thresholds as a starting point:

| Metric | Operator | Threshold | Duration |
|---|---|---|---|
| `cpu_usage` | > | 85 | 10 min |
| `memory_usage_percent` | > | 90 | 5 min |
| `disk_usage_percent` | > | 90 | 0 (page immediately) |
| `load_avg_5m` | > | `cpuCount × 1.5` | 10 min |

These are starting points only. Tune to your workload.
