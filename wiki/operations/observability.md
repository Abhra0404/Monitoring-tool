# Observability

Theoria itself emits metrics, logs, and traces. Wire these into your existing observability stack.

## Self-metrics (Prometheus)

`GET /internal/metrics` returns Prometheus-format metrics:

```
# HELP theoria_http_requests_total HTTP requests received
# TYPE theoria_http_requests_total counter
theoria_http_requests_total{method="GET",route="/api/servers",status="200"} 1234

# HELP theoria_ingest_metrics_total Metric points received
# TYPE theoria_ingest_metrics_total counter
theoria_ingest_metrics_total 567890

# HELP theoria_db_pool_utilization Postgres pool utilisation 0..1
# TYPE theoria_db_pool_utilization gauge
theoria_db_pool_utilization 0.32

# HELP theoria_socket_connections Active Socket.IO connections
# TYPE theoria_socket_connections gauge
theoria_socket_connections 47
```

### Authentication

Set `INTERNAL_METRICS_TOKEN`. Scrapers must send `Authorization: Bearer <token>`.

### Prometheus scrape config

```yaml
scrape_configs:
  - job_name: theoria
    metrics_path: /internal/metrics
    bearer_token_file: /etc/prometheus/secrets/theoria-token
    static_configs:
      - targets: ["theoria.theoria.svc.cluster.local:4000"]
```

### Prometheus Operator (Helm)

The chart includes a `ServiceMonitor` template:

```bash
helm upgrade theoria ./charts/theoria --reuse-values \
  --set serviceMonitor.enabled=true \
  --set serviceMonitor.metricsToken.existingSecret=theoria-internal-metrics \
  --set serviceMonitor.metricsToken.key=token
```

### Key metrics to alert on

| Metric | Threshold |
|---|---|
| `theoria_db_pool_utilization` | > 0.8 for 5 min |
| `rate(theoria_http_requests_total{status=~"5.."}[5m])` | > 0.05 |
| `theoria_ingest_queue_depth` | > 5000 for 1 min |
| `theoria_socket_connections` | sudden 50 % drop |
| `histogram_quantile(0.95, theoria_plugin_tick_duration_seconds_bucket)` | > 1 s |

## Logs

Theoria uses [Pino](https://getpino.io) for structured JSON logging. Each line includes:

- `level` (10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal)
- `time` (ms since epoch)
- `correlationId` (also returned as `X-Correlation-Id` response header)
- `userId` (when applicable)
- `pluginName`, `instanceId` (for plugin host logs)

### Shipping

For Kubernetes, use any sidecar or DaemonSet log shipper (Fluent Bit, Vector, OTel Collector). The default container logs to stdout.

For systemd:

```bash
LOG_DESTINATION=/var/log/theoria.log
```

Then point Vector or Filebeat at the file.

### Sentry

Set `SENTRY_DSN` to enable Sentry error reporting:

```
SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

Only `level >= 50` (error/fatal) is forwarded by default. Tracing is opt-in via the sample rate.

## Traces (OpenTelemetry)

Theoria emits OTLP traces when configured:

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com:4318
OTEL_SERVICE_NAME=theoria
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
```

Spans cover:

- HTTP request lifecycle (`http.method`, `http.route`, `http.status_code`)
- Database queries (`db.system=postgresql`, `db.statement` redacted)
- Redis commands
- Plugin tick execution (`theoria.plugin.name`, `theoria.plugin.instance_id`)
- Alert rule evaluation

Pair with [OpenTelemetry ingestion](../integrations/opentelemetry.md) on the agent side for end-to-end traces from monitored apps to the alerting decision.

## Dashboards

A starter Grafana dashboard JSON is in `deploy/grafana/theoria-self-metrics.json`. Import it into Grafana 11+; it expects a Prometheus datasource named `Prometheus`.

The dashboard surfaces:

- Request rate / latency / error rate
- Ingestion rate and queue depth
- Pool / Redis / Socket.IO health
- Plugin tick durations
- Top alert rules by evaluation count

## Audit log

Critical actions (user create/delete, API key regeneration, plugin install/uninstall, alert rule change) are logged to a dedicated `audit_events` table:

```sql
SELECT time, actor_id, action, target_type, target_id, metadata
FROM audit_events
ORDER BY time DESC LIMIT 100;
```

Retention defaults to 365 days; tune via `AUDIT_RETENTION_DAYS`.
