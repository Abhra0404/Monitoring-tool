/**
 * OpenTelemetry Protocol (OTLP) metric ingestion.
 *
 * Accepts OTLP/HTTP JSON at `POST /v1/metrics` per the OTEL specification
 * (https://opentelemetry.io/docs/specs/otlp/#otlphttp). This lets any
 * instrumented service whose SDK targets an OTLP HTTP exporter point
 * `OTEL_EXPORTER_OTLP_ENDPOINT=https://theoria/v1/metrics` and have its
 * metrics land in Theoria's metric store with zero code changes.
 *
 * Scope: JSON Protobuf encoding (Content-Type `application/json`). Binary
 * protobuf requires a separate decoder and is not in the Phase 5 plan.
 *
 * Supported metric shapes (the three that matter): `gauge`, `sum`, and
 * `histogram`. The last is expanded into `_count`, `_sum`, and per-bucket
 * `_bucket{le="…"}` samples in the Prometheus convention so downstream
 * alert rules can operate on them.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

// ── Minimal typed views of the OTLP JSON envelope ───────────────────────────

interface OtlpKeyValue {
  key: string;
  value?:
    | { stringValue?: string }
    | { intValue?: string | number }
    | { doubleValue?: number }
    | { boolValue?: boolean }
    | Record<string, unknown>;
}

interface OtlpNumberDataPoint {
  attributes?: OtlpKeyValue[];
  timeUnixNano?: string | number;
  asInt?: string | number;
  asDouble?: number;
}

interface OtlpHistogramDataPoint {
  attributes?: OtlpKeyValue[];
  timeUnixNano?: string | number;
  count?: string | number;
  sum?: number;
  bucketCounts?: Array<string | number>;
  explicitBounds?: number[];
}

interface OtlpMetric {
  name?: string;
  unit?: string;
  description?: string;
  gauge?: { dataPoints?: OtlpNumberDataPoint[] };
  sum?: { dataPoints?: OtlpNumberDataPoint[]; isMonotonic?: boolean };
  histogram?: { dataPoints?: OtlpHistogramDataPoint[] };
}

interface OtlpScopeMetrics {
  scope?: { name?: string; version?: string };
  metrics?: OtlpMetric[];
}

interface OtlpResourceMetrics {
  resource?: { attributes?: OtlpKeyValue[] };
  scopeMetrics?: OtlpScopeMetrics[];
}

interface OtlpExportMetricsRequest {
  resourceMetrics?: OtlpResourceMetrics[];
}

// ── Attribute helpers ───────────────────────────────────────────────────────

function attrString(v: OtlpKeyValue["value"]): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const rec = v as Record<string, unknown>;
  if (typeof rec.stringValue === "string") return rec.stringValue;
  if (typeof rec.intValue === "string" || typeof rec.intValue === "number") return String(rec.intValue);
  if (typeof rec.doubleValue === "number") return String(rec.doubleValue);
  if (typeof rec.boolValue === "boolean") return String(rec.boolValue);
  return undefined;
}

function collectLabels(...sets: Array<OtlpKeyValue[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const set of sets) {
    if (!set) continue;
    for (const kv of set) {
      const v = attrString(kv.value);
      if (v !== undefined) out[kv.key] = v;
    }
  }
  return out;
}

/** Convert OTLP point values (may arrive as strings for int64 safety). */
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toTimestamp(nano: string | number | undefined): Date {
  if (nano === undefined || nano === null) return new Date();
  const asNum = typeof nano === "string" ? Number(nano) : nano;
  if (!Number.isFinite(asNum) || asNum <= 0) return new Date();
  // OTLP unixNano → ms
  return new Date(Math.floor(asNum / 1_000_000));
}

// ── Public: flatten an OTLP request into metric rows ────────────────────────

export interface FlattenedMetric {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}

export function flattenOtlpRequest(req: OtlpExportMetricsRequest): FlattenedMetric[] {
  const out: FlattenedMetric[] = [];
  if (!req || !Array.isArray(req.resourceMetrics)) return out;

  for (const rm of req.resourceMetrics) {
    const resourceLabels = collectLabels(rm.resource?.attributes);
    for (const sm of rm.scopeMetrics ?? []) {
      for (const metric of sm.metrics ?? []) {
        const name = (metric.name || "").trim();
        if (!name) continue;

        if (metric.gauge?.dataPoints) {
          for (const dp of metric.gauge.dataPoints) {
            const v = toNumber(dp.asDouble ?? dp.asInt);
            if (v === null) continue;
            out.push({
              name,
              value: v,
              labels: { ...resourceLabels, ...collectLabels(dp.attributes) },
              timestamp: toTimestamp(dp.timeUnixNano),
            });
          }
        }

        if (metric.sum?.dataPoints) {
          for (const dp of metric.sum.dataPoints) {
            const v = toNumber(dp.asDouble ?? dp.asInt);
            if (v === null) continue;
            out.push({
              name,
              value: v,
              labels: { ...resourceLabels, ...collectLabels(dp.attributes) },
              timestamp: toTimestamp(dp.timeUnixNano),
            });
          }
        }

        if (metric.histogram?.dataPoints) {
          for (const dp of metric.histogram.dataPoints) {
            const baseLabels = { ...resourceLabels, ...collectLabels(dp.attributes) };
            const ts = toTimestamp(dp.timeUnixNano);
            const count = toNumber(dp.count);
            if (count !== null) {
              out.push({ name: `${name}_count`, value: count, labels: baseLabels, timestamp: ts });
            }
            if (typeof dp.sum === "number" && Number.isFinite(dp.sum)) {
              out.push({ name: `${name}_sum`, value: dp.sum, labels: baseLabels, timestamp: ts });
            }
            const bounds = dp.explicitBounds ?? [];
            const buckets = dp.bucketCounts ?? [];
            let cumulative = 0;
            for (let i = 0; i < buckets.length; i++) {
              const n = toNumber(buckets[i]);
              if (n === null) continue;
              cumulative += n;
              const le = i < bounds.length ? String(bounds[i]) : "+Inf";
              out.push({
                name: `${name}_bucket`,
                value: cumulative,
                labels: { ...baseLabels, le },
                timestamp: ts,
              });
            }
          }
        }
      }
    }
  }

  return out;
}

// ── Fastify plugin ──────────────────────────────────────────────────────────

export default async function otlpRoutes(app: FastifyInstance): Promise<void> {
  // OTLP payloads can be several MB for high-cardinality histograms; 8 MB
  // matches the otel-collector default. Fastify's default bodyLimit is 1 MB
  // so we raise it per-route rather than globally.
  const OTLP_BODY_LIMIT = 8 * 1024 * 1024;

  app.post(
    "/v1/metrics",
    {
      preHandler: [app.authenticateApiKey],
      bodyLimit: OTLP_BODY_LIMIT,
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["OpenTelemetry"],
        summary: "Ingest metrics in OTLP/HTTP JSON format",
        description:
          "Standards-compliant OpenTelemetry Protocol endpoint. Accepts " +
          "`ExportMetricsServiceRequest` JSON (gauge / sum / histogram) " +
          "and stores the points in Theoria's metric store. Authenticate " +
          "with an agent API key via `Authorization: Bearer <key>`.",
        response: {
          200: {
            type: "object",
            properties: {
              accepted: { type: "integer" },
              partialSuccess: {
                type: "object",
                properties: {
                  rejectedDataPoints: { type: "integer" },
                  errorMessage: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = (req.body ?? {}) as OtlpExportMetricsRequest;
      const userId = req.user._id;

      let flat: FlattenedMetric[];
      try {
        flat = flattenOtlpRequest(body);
      } catch (err) {
        return reply.code(400).send({
          error: "invalid OTLP payload",
          message: (err as Error).message,
        });
      }

      if (flat.length === 0) {
        return reply.code(200).send({ accepted: 0 });
      }

      // Store. Metric store de-dupes by (name, labels, timestamp) implicitly
      // via the metrics hypertable; we just forward the rows.
      const rows = flat.map((f) => ({
        userId,
        name: f.name,
        value: f.value,
        labels: f.labels,
        timestamp: f.timestamp,
      }));
      app.store.Metrics.insertMany(rows);
      app.metrics?.metricsIngested.inc({ source: "otlp" }, rows.length);

      // Broadcast a summary so the dashboard live-counter ticks up.
      if (app.io) {
        app.io.to("all").emit("otlp:ingest", {
          count: flat.length,
          firstName: flat[0].name,
          timestamp: Date.now(),
        });
      }

      return reply.code(200).send({ accepted: flat.length });
    },
  );
}
