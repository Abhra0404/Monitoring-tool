# OpenTelemetry (OTLP)

Theoria accepts metrics over OpenTelemetry's HTTP/JSON protocol at `/v1/metrics`. This is the integration of choice for application-level custom metrics.

## Endpoint

```
POST /v1/metrics
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

## What's supported

| OTLP type | Mapping in Theoria |
|---|---|
| `Gauge` | One row per data point with the gauge value |
| `Sum` (cumulative or delta, monotonic or not) | One row per data point with the running value |
| `Histogram` | Up to 8 derived rows per histogram: `_count`, `_sum`, and `_bucket{le=…}` for each explicit bound |
| `ExponentialHistogram` | Not yet implemented; data is dropped silently |
| Resource attributes | `service.name` becomes `serverId`; remaining attributes are merged into `labels` |
| Scope attributes | Merged into `labels` |
| Data point attributes | Merged into `labels` (highest precedence) |

The HTTP/JSON wire format mirrors the [OTLP spec v1.0](https://opentelemetry.io/docs/specs/otlp/). The protobuf transport is not yet supported.

## OpenTelemetry Collector

Configure an exporter:

```yaml
exporters:
  otlphttp/theoria:
    endpoint: https://monitor.example.com
    headers:
      Authorization: Bearer ${env:THEORIA_API_KEY}
    encoding: json

service:
  pipelines:
    metrics:
      exporters: [otlphttp/theoria]
```

The endpoint is the **base URL** of your Theoria deployment; the collector appends `/v1/metrics` automatically.

## Direct from a Node.js service

```ts
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { Resource } from "@opentelemetry/resources";

const exporter = new OTLPMetricExporter({
  url: "https://monitor.example.com/v1/metrics",
  headers: { Authorization: `Bearer ${process.env.THEORIA_API_KEY}` },
});

const provider = new MeterProvider({
  resource: new Resource({ "service.name": "checkout" }),
  readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 10000 })],
});

const meter = provider.getMeter("checkout");
const ordersCompleted = meter.createCounter("orders.completed");

// In your business logic:
ordersCompleted.add(1, { region: "eu-west-1" });
```

## Direct from a Python service

```python
from opentelemetry import metrics
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource

exporter = OTLPMetricExporter(
    endpoint="https://monitor.example.com/v1/metrics",
    headers={"Authorization": "Bearer " + os.environ["THEORIA_API_KEY"]},
)
reader = PeriodicExportingMetricReader(exporter, export_interval_millis=10_000)
provider = MeterProvider(
    resource=Resource.create({"service.name": "checkout"}),
    metric_readers=[reader],
)
metrics.set_meter_provider(provider)

meter = metrics.get_meter("checkout")
orders = meter.create_counter("orders.completed")
orders.add(1, {"region": "eu-west-1"})
```

## Naming and labelling

- **Metric names** keep their OTLP form (`orders.completed`). Use them verbatim in alert rules.
- **`service.name`** becomes `serverId`. Pick a stable identifier per service.
- **High-cardinality attributes** (e.g. user IDs) explode storage. Stick to known dimensions like region, environment, role.

## Querying OTLP metrics

The `metrics` hypertable doesn't distinguish OTLP from agent metrics. Use the standard `/api/servers/:serverId/metrics` endpoint with `serverId = service.name`:

```bash
curl "https://monitor.example.com/api/servers/checkout/metrics?timeRange=1h" \
  -H "Authorization: Bearer <jwt>"
```

## Limitations

- HTTP/JSON only (no protobuf, no gRPC).
- Histograms are flattened into bucket counters; native histogram aggregation is not supported.
- Exemplars and trace context are accepted but not stored.
- The endpoint enforces a 1 MiB body limit and a 10 / sec / IP rate limit (shared with agent ingestion).

If you need full OTLP / OpenTelemetry trace support, run [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) in front of Theoria and route metrics-only traffic to `/v1/metrics`.
