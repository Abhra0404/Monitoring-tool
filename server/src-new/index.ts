/**
 * Theoria Server — Fastify + TypeScript entry point
 *
 * Replaces server/src/index.js (Express).
 * Registers plugins (store, Socket.IO, auth) then route modules.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { loadConfig } from "./config.js";

// Plugins
import storePlugin from "./plugins/store.js";
import socketioPlugin from "./plugins/socketio.js";
import authPlugin from "./plugins/auth.js";

// Route modules
import metricsRoutes from "./modules/metrics/routes.js";
import serversRoutes from "./modules/servers/routes.js";
import alertsRoutes from "./modules/alerts/routes.js";
import authRoutes from "./modules/auth/routes.js";
import dockerRoutes from "./modules/docker/routes.js";
import httpChecksRoutes from "./modules/http-checks/routes.js";
import pipelinesRoutes from "./modules/pipelines/routes.js";
import notificationsRoutes from "./modules/notifications/routes.js";
import statusPageRoutes from "./modules/status-page/routes.js";

// HTTP check runner
import { initRunner, startAll as startHttpChecks } from "./modules/http-checks/runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main(): Promise<void> {
  const config = loadConfig();

  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      transport: config.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
    },
  });

  // ── Core plugins ──
  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: "1 minute",
  });
  await app.register(storePlugin);
  await app.register(socketioPlugin);
  await app.register(authPlugin);

  // ── Health check ──
  app.get("/health", async () => ({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    storage: "in-memory",
  }));

  // ── Route modules ──
  await app.register(metricsRoutes);
  await app.register(serversRoutes, { prefix: "/api/servers" });
  await app.register(alertsRoutes, { prefix: "/api/alerts" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(dockerRoutes, { prefix: "/api/docker" });
  await app.register(httpChecksRoutes, { prefix: "/api/http-checks" });
  await app.register(pipelinesRoutes, { prefix: "/api/pipelines" });
  await app.register(notificationsRoutes, { prefix: "/api/notifications" });
  await app.register(statusPageRoutes, { prefix: "/api/status-page" });

  // ── Serve React client build (SPA) ──
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

    // SPA fallback — any non-API route serves index.html
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith("/api/") || req.url.startsWith("/metrics") || req.url === "/health") {
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

  // ── Initialize HTTP check runner ──
  initRunner(app.store, app.io);
  startHttpChecks();

  // ── Start ──
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Theoria server running on ${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // ── Graceful shutdown ──
  const shutdown = async (): Promise<void> => {
    app.log.info("Shutting down gracefully...");
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main();
