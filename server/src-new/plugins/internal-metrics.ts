/**
 * Internal Prometheus metrics.
 *
 * Exposes Theoria's own operational metrics at `GET /internal/metrics` in
 * the Prometheus exposition format so the server can monitor itself.
 *
 * Fastify's default logger is Pino — we hook into the `onRequest`/`onResponse`
 * lifecycle to record HTTP request durations. Other counters are updated
 * from inside the relevant modules via `app.metrics.*`.
 *
 * Metrics exposed (see plans/implementation-plan.md §8.4):
 *   - theoria_process_*                             (prom-client defaults)
 *   - theoria_api_request_duration_seconds          (histogram)
 *   - theoria_api_requests_total                    (counter, route+status)
 *   - theoria_agents_connected                      (gauge)
 *   - theoria_metrics_ingested_total                (counter)
 *   - theoria_alerts_firing                         (gauge)
 *   - theoria_http_checks_total                     (counter, status)
 *   - theoria_socketio_connections                  (gauge)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "theoria_process_" });

export const requestDuration = new client.Histogram({
  name: "theoria_api_request_duration_seconds",
  help: "Duration of HTTP API requests, in seconds.",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const requestsTotal = new client.Counter({
  name: "theoria_api_requests_total",
  help: "Total number of HTTP API requests.",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const agentsConnected = new client.Gauge({
  name: "theoria_agents_connected",
  help: "Number of agents currently reachable (non-offline).",
  registers: [register],
});

export const metricsIngested = new client.Counter({
  name: "theoria_metrics_ingested_total",
  help: "Total metric data points ingested.",
  labelNames: ["source"], // agent | otlp
  registers: [register],
});

export const alertsFiring = new client.Gauge({
  name: "theoria_alerts_firing",
  help: "Number of currently-firing alerts.",
  registers: [register],
});

export const httpChecksTotal = new client.Counter({
  name: "theoria_http_checks_total",
  help: "HTTP check executions by final status.",
  labelNames: ["status"], // up | down | degraded | pending
  registers: [register],
});

export const socketioConnections = new client.Gauge({
  name: "theoria_socketio_connections",
  help: "Current Socket.IO client connections.",
  registers: [register],
});

export { register };

/** Read-only handles exposed on the Fastify instance. */
export interface MetricsRegistry {
  requestDuration: client.Histogram<string>;
  requestsTotal: client.Counter<string>;
  agentsConnected: client.Gauge<string>;
  metricsIngested: client.Counter<string>;
  alertsFiring: client.Gauge<string>;
  httpChecksTotal: client.Counter<string>;
  socketioConnections: client.Gauge<string>;
  register: client.Registry;
}

declare module "fastify" {
  interface FastifyInstance {
    metrics: MetricsRegistry;
  }
}

export default fp(async function internalMetricsPlugin(app: FastifyInstance) {
  const registry: MetricsRegistry = {
    requestDuration,
    requestsTotal,
    agentsConnected,
    metricsIngested,
    alertsFiring,
    httpChecksTotal,
    socketioConnections,
    register,
  };
  app.decorate("metrics", registry);

  // Per-request timing via lifecycle hooks. Use routerPath (the pattern,
  // e.g. `/api/servers/:id`) so cardinality doesn't explode.
  app.addHook("onRequest", async (req: FastifyRequest) => {
    (req as FastifyRequest & { _startHr: bigint })._startHr = process.hrtime.bigint();
  });
  app.addHook("onResponse", async (req: FastifyRequest, reply: FastifyReply) => {
    const start = (req as FastifyRequest & { _startHr?: bigint })._startHr;
    if (!start) return;
    const durSec = Number(process.hrtime.bigint() - start) / 1e9;
    const route = (req.routeOptions?.url ?? req.url ?? "unknown").toString();
    // Skip the metrics endpoint itself — scraping should not inflate itself.
    if (route === "/internal/metrics") return;
    const labels = { method: req.method, route, status: String(reply.statusCode) };
    requestDuration.observe(labels, durSec);
    requestsTotal.inc(labels);
  });

  // Socket.IO connection gauge. Registered once the socketio plugin has
  // attached `app.io`.
  app.addHook("onReady", async () => {
    if (!app.io) return;
    app.io.on("connection", (socket) => {
      socketioConnections.inc();
      socket.on("disconnect", () => socketioConnections.dec());
    });
  });

  // Refresh the agents/alerts gauges on every scrape so they reflect the
  // live store without a separate background job.
  app.get(
    "/internal/metrics",
    {
      logLevel: "warn",
      schema: {
        tags: ["Observability"],
        summary: "Prometheus exposition endpoint for Theoria's internal metrics.",
        response: {
          200: { type: "string" },
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const users = app.store.Users.listAll();
        let reachable = 0;
        for (const u of users) {
          for (const s of app.store.Servers.find(u._id)) {
            if (s.status !== "offline") reachable++;
          }
        }
        agentsConnected.set(reachable);
      } catch {
        // Store not yet ready during early boot — leave gauge at last value.
      }
      try {
        const firing = app.store.AlertHistory.find({ status: "firing" }, 10_000).length;
        alertsFiring.set(firing);
      } catch {
        // Ignore.
      }

      reply.header("Content-Type", register.contentType);
      return register.metrics();
    },
  );
});

/** Reset all metric values — useful between test cases. */
export function __resetMetricsForTests() {
  register.resetMetrics();
}
