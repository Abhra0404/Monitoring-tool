/**
 * App factory — builds a Fastify instance with all plugins and routes registered,
 * but does NOT call .listen(). Used by both the production entry point
 * (src-new/index.ts) and the integration tests.
 */

import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import helmet from "@fastify/helmet";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";

import { loadConfig, Config } from "./config.js";

import storePlugin from "./plugins/store.js";
import databasePlugin from "./plugins/database.js";
import redisPlugin from "./plugins/redis.js";
import socketioPlugin from "./plugins/socketio.js";
import authPlugin from "./plugins/auth.js";
import lockoutPlugin from "./plugins/lockout.js";
import internalMetricsPlugin from "./plugins/internal-metrics.js";
import sentryPlugin from "./plugins/sentry.js";

import metricsRoutes from "./modules/metrics/routes.js";
import serversRoutes from "./modules/servers/routes.js";
import alertsRoutes from "./modules/alerts/routes.js";
import authRoutes from "./modules/auth/routes.js";
import dockerRoutes from "./modules/docker/routes.js";
import httpChecksRoutes from "./modules/http-checks/routes.js";
import tcpChecksRoutes from "./modules/tcp-checks/routes.js";
import pingChecksRoutes from "./modules/ping-checks/routes.js";
import dnsChecksRoutes from "./modules/dns-checks/routes.js";
import heartbeatsRoutes from "./modules/heartbeats/routes.js";
import pipelinesRoutes from "./modules/pipelines/routes.js";
import notificationsRoutes from "./modules/notifications/routes.js";
import statusPageRoutes from "./modules/status-page/routes.js";
import eventsRoutes from "./modules/events/routes.js";
import incidentsRoutes from "./modules/incidents/routes.js";
import pluginsRoutes, { initPluginsOnBoot } from "./modules/plugins/routes.js";
import otlpRoutes from "./modules/otlp/routes.js";

import { initRunner } from "./modules/http-checks/runner.js";
import { initTcpRunner } from "./modules/tcp-checks/runner.js";
import { initPingRunner } from "./modules/ping-checks/runner.js";
import { initDnsRunner } from "./modules/dns-checks/runner.js";
import { initHeartbeatRunner } from "./modules/heartbeats/runner.js";
import { bootstrapAdmin } from "./modules/auth/bootstrap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BuildAppOptions {
  /** Override config — useful for tests. Merged on top of loadConfig(). */
  config?: Partial<Config>;
  /** Skip serving the client build (tests don't need it). */
  skipClientBuild?: boolean;
  /** Skip registering @fastify/swagger (tests don't need it). */
  skipSwagger?: boolean;
  /** Override logger — pass `false` to disable, or a level string. */
  logger?: boolean | { level?: string };
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = { ...loadConfig(), ...(opts.config ?? {}) } as Config;

  // Pretty logging only in dev AND only if pino-pretty is actually resolvable.
  let prettyTransport: { target: string } | undefined;
  if (opts.logger !== false && config.NODE_ENV === "development") {
    try {
      const req = createRequire(import.meta.url);
      req.resolve("pino-pretty");
      prettyTransport = { target: "pino-pretty" };
    } catch {
      // pino-pretty unavailable — JSON logging
    }
  }

  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level:
              (typeof opts.logger === "object" && opts.logger.level) ||
              config.LOG_LEVEL ||
              (config.NODE_ENV === "production" ? "info" : "debug"),
            transport: prettyTransport,
            // Structured redaction — the JWT secret and Authorization headers
            // must never appear in logs, even when a request body is logged.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-api-key"]',
                'res.headers["set-cookie"]',
                'req.body.password',
                'req.body.refreshToken',
              ],
              remove: true,
            },
          },
    // Generate / propagate a correlation ID per request. Accepts an inbound
    // `x-request-id` header (trusted upstream proxies) and falls back to a
    // fresh UUID. Fastify automatically attaches this to every log line.
    genReqId(req) {
      const incoming = req.headers["x-request-id"];
      if (typeof incoming === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(incoming)) {
        return incoming;
      }
      return crypto.randomUUID();
    },
    // Fastify-native Trust Proxy — required for `req.ip` to reflect the real
    // client when Theoria sits behind Caddy / nginx / ALB. Safe default:
    // trust loopback plus the first hop (can be widened via env if needed).
    trustProxy: config.NODE_ENV === "production",
  });

  // Return the request ID so clients can correlate a 5xx with server logs.
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("x-request-id", reply.request.id);
    return payload;
  });

  // Once authentication runs, tag the log binding with the user id so every
  // subsequent log line under this request includes it automatically.
  app.addHook("preHandler", async (req) => {
    if (req.user) {
      req.log = req.log.child({ userId: req.user._id });
    }
  });

  // ── Security headers (Helmet) ──
  // CSP in production; relaxed in dev because Vite + Swagger-UI need inline
  // styles. Turn OFF cross-origin isolation: Theoria serves the dashboard
  // from the same origin as the API, and Socket.IO uses the same origin
  // for its websocket upgrade, so the defaults are already safe.
  await app.register(helmet, {
    contentSecurityPolicy:
      config.NODE_ENV === "production"
        ? {
            directives: {
              defaultSrc: ["'self'"],
              // SwaggerUI needs its own inline styles + Socket.IO client needs
              // an ws/wss upgrade to the same origin.
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'", "ws:", "wss:"],
              fontSrc: ["'self'", "data:"],
              objectSrc: ["'none'"],
              frameAncestors: ["'self'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
            },
          }
        : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  // ── CORS ──
  // Production deployments MUST set `CORS_ORIGINS` to a comma-separated list.
  // If someone forgets and leaves it at "*" in production we refuse to boot
  // — better to fail fast than expose the API to the world.
  if (config.NODE_ENV === "production" && config.CORS_ORIGINS === "*") {
    throw new Error(
      "CORS_ORIGINS is '*' in production. Set it to a comma-separated list of allowed origins.",
    );
  }
  await app.register(cors, {
    origin:
      config.CORS_ORIGINS === "*"
        ? true
        : config.CORS_ORIGINS.split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.register(storePlugin);
  await app.register(databasePlugin);
  await app.register(redisPlugin);

  // Rate-limit — uses Redis when available so it is accurate across replicas.
  await app.register(rateLimit, {
    global: false,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    redis: app.redis?.client,
  });

  await app.register(socketioPlugin);
  await app.register(authPlugin);
  await app.register(lockoutPlugin);
  await app.register(internalMetricsPlugin);
  await app.register(sentryPlugin);

  // ── OpenAPI docs ──
  // Must be registered BEFORE route plugins so their JSON schemas get
  // inventoried. Skipped in test mode to keep `app.inject()` logs quiet.
  if (opts.skipSwagger !== true) {
    await app.register(swagger, {
      openapi: {
        openapi: "3.0.3",
        info: {
          title: "Theoria API",
          description:
            "Self-hosted observability server. Generated from Fastify JSON schemas.",
          version: (() => {
            try {
              const req = createRequire(import.meta.url);
              return (req("../package.json") as { version?: string }).version ?? "1.0.0";
            } catch {
              return "1.0.0";
            }
          })(),
          license: { name: "MIT" },
        },
        servers: [{ url: "/" }],
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
            apiKeyAuth: { type: "http", scheme: "bearer", bearerFormat: "Opaque API key" },
          },
        },
        tags: [
          { name: "Auth", description: "Login, token refresh, onboarding" },
          { name: "Servers", description: "Monitored servers" },
          { name: "Metrics", description: "Agent metric ingestion & queries" },
          { name: "Alerts", description: "Alert rules & history" },
          { name: "HTTP Checks", description: "External HTTP monitoring" },
          { name: "TCP Checks", description: "TCP port monitoring" },
          { name: "Ping Checks", description: "ICMP monitoring" },
          { name: "DNS Checks", description: "DNS record monitoring" },
          { name: "Heartbeats", description: "Cron / job heartbeat monitors" },
          { name: "Pipelines", description: "CI pipeline integrations" },
          { name: "Notifications", description: "Alert destinations" },
          { name: "Status Page", description: "Public status page config & data" },
          { name: "Events", description: "Unified event timeline" },
          { name: "Incidents", description: "Incident management" },
          { name: "Plugins", description: "Installable server-check plugins" },
          { name: "OpenTelemetry", description: "OTLP metric ingestion" },
          { name: "Observability", description: "Prometheus /internal/metrics" },
        ],
      },
    });
    await app.register(swaggerUi, {
      routePrefix: "/api/docs",
      uiConfig: { docExpansion: "none", deepLinking: true },
      staticCSP: true,
    });
  }

  // Bootstrap admin user AFTER the database has hydrated (so existing users
  // from DB are loaded) but BEFORE any dashboard request can hit an
  // unauthenticated state.
  await bootstrapAdmin(app.store, {
    adminEmail: config.ADMIN_EMAIL,
    adminPassword: config.ADMIN_PASSWORD,
    log: app.log,
  });

  // ── Health endpoints ──
  // `/health` (legacy) — kept for back-compat with existing uptime checks.
  // `/health/live`  — does the process respond? Must never depend on Redis
  //                   or Postgres. Used by the k8s `livenessProbe`.
  // `/health/ready` — are we ready to serve traffic? Checks Redis + Postgres
  //                   if configured. Used by the k8s `readinessProbe`.
  const bootedAt = Date.now();
  app.get("/health", async () => ({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    storage: app.db ? "postgres+memory" : "in-memory",
  }));
  app.get("/health/live", async () => ({
    status: "ok",
    uptime: process.uptime(),
    bootedAt: new Date(bootedAt).toISOString(),
  }));
  app.get("/health/ready", async (_req, reply) => {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};
    let allOk = true;

    if (app.db) {
      try {
        await app.db.execute("select 1");
        checks.database = { ok: true };
      } catch (err) {
        checks.database = { ok: false, detail: (err as Error).message };
        allOk = false;
      }
    }
    if (app.redis) {
      try {
        const pong = await app.redis.client.ping();
        checks.redis = { ok: pong === "PONG" };
        if (pong !== "PONG") allOk = false;
      } catch (err) {
        checks.redis = { ok: false, detail: (err as Error).message };
        allOk = false;
      }
    }

    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? "ready" : "not_ready",
      checks,
    });
  });

  // ── Routes ──
  await app.register(metricsRoutes);
  await app.register(serversRoutes, { prefix: "/api/servers" });
  await app.register(alertsRoutes, { prefix: "/api/alerts" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(dockerRoutes, { prefix: "/api/docker" });
  await app.register(httpChecksRoutes, { prefix: "/api/http-checks" });
  await app.register(tcpChecksRoutes, { prefix: "/api/tcp-checks" });
  await app.register(pingChecksRoutes, { prefix: "/api/ping-checks" });
  await app.register(dnsChecksRoutes, { prefix: "/api/dns-checks" });
  await app.register(heartbeatsRoutes, { prefix: "/api/heartbeats" });
  await app.register(pipelinesRoutes, { prefix: "/api/pipelines" });
  await app.register(notificationsRoutes, { prefix: "/api/notifications" });
  await app.register(statusPageRoutes, { prefix: "/api/status-page" });
  await app.register(eventsRoutes, { prefix: "/api/events" });
  await app.register(incidentsRoutes, { prefix: "/api/incidents" });
  await app.register(pluginsRoutes, { prefix: "/api/plugins" });
  await app.register(otlpRoutes);

  // ── Client SPA ──
  if (!opts.skipClientBuild) {
    const clientBuildPaths = [
      path.join(__dirname, "../../client/build"),
      path.join(__dirname, "../client/build"),
      config.CLIENT_BUILD_PATH,
    ].filter(Boolean) as string[];

    const clientBuildDir = clientBuildPaths.find((p) =>
      fs.existsSync(path.join(p, "index.html")),
    );

    if (clientBuildDir) {
      await app.register(fastifyStatic, {
        root: clientBuildDir,
        prefix: "/",
        wildcard: false,
      });

      app.setNotFoundHandler(async (req, reply) => {
        if (
          req.url.startsWith("/api/") ||
          req.url.startsWith("/metrics") ||
          req.url === "/health"
        ) {
          return reply.status(404).send({ error: "Not found" });
        }
        return reply.sendFile("index.html", clientBuildDir);
      });

      app.log.info(`Serving dashboard from ${clientBuildDir}`);
    } else {
      app.get("/", async () => ({
        name: "Theoria API",
        version: "1.0.0",
        status: "running",
        message: "Dashboard not built. Run: npm run build --prefix client",
      }));
    }
  }

  // ── Monitor runners (scheduling starts in index.ts after listen()) ──
  initRunner(app.store, app.io);
  initTcpRunner(app.store, app.io);
  initPingRunner(app.store, app.io);
  initDnsRunner(app.store, app.io);
  initHeartbeatRunner(app.store, app.io);
  initPluginsOnBoot(app);

  return app;
}
