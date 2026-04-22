/**
 * Theoria Server — Fastify + TypeScript entry point.
 *
 * Wires buildApp() to .listen() and sets up graceful shutdown.
 * All plugin/route registration lives in app.ts.
 */

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { startAll as startHttpChecks } from "./modules/http-checks/runner.js";
import { startAllTcpChecks } from "./modules/tcp-checks/runner.js";
import { startAllPingChecks } from "./modules/ping-checks/runner.js";
import { startAllDnsChecks } from "./modules/dns-checks/runner.js";
import { startHeartbeatSweeper } from "./modules/heartbeats/runner.js";
import { startReachabilityChecker } from "./modules/servers/reachability.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp();

  startHttpChecks();
  startAllTcpChecks();
  startAllPingChecks();
  startAllDnsChecks();
  startHeartbeatSweeper();
  startReachabilityChecker(app.store, app.io);

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Theoria server running on ${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const SHUTDOWN_TIMEOUT_MS = 25_000;
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "Shutting down gracefully...");

    // Force-kill if shutdown takes too long — k8s gives us ~30s before
    // SIGKILL, so bail out at 25s with a clear diagnostic.
    const killer = setTimeout(() => {
      app.log.error("Graceful shutdown timed out; forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    killer.unref();

    try {
      // 1) Stop accepting new connections.
      //    Fastify close flushes onClose hooks (redis quit, sentry flush,
      //    db pool drain, JSON persist) in reverse registration order.
      // 2) Socket.IO: disconnect clients cleanly so they can reconnect to
      //    the replacement replica instead of hanging on a half-closed TCP.
      if (app.io) {
        app.io.disconnectSockets(true);
      }
      await app.close();
      app.log.info("Shutdown complete");
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    app.log.fatal({ err }, "uncaughtException — shutting down");
    void shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    app.log.fatal({ reason }, "unhandledRejection — shutting down");
    void shutdown("unhandledRejection");
  });
}

main();
