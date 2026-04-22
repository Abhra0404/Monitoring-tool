/**
 * Database Fastify plugin.
 *
 * When DATABASE_URL is set:
 *   1. Opens a connection pool.
 *   2. Runs pending migrations.
 *   3. Hydrates the in-memory store from DB.
 *   4. Subscribes a write-through persistence handler to the mutation bus.
 *   5. Decorates `app.db` with the Drizzle instance.
 *
 * When DATABASE_URL is not set, the plugin is a no-op and the server runs in
 * zero-config mode backed only by the in-memory store + JSON snapshot.
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { getDb, getSql, closeDb, ping } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";
import { hydrateStoreFromDb } from "../db/hydrate.js";
import { attachPersistence } from "../db/persist.js";
import type { Db } from "../db/connection.js";

export default fp(
  async function databasePlugin(app: FastifyInstance) {
    if (!process.env.DATABASE_URL) {
      app.log.info("DATABASE_URL not set — running with in-memory store only");
      app.decorate("db", null as Db | null);
      return;
    }

    // Connectivity check before running migrations — fail fast.
    const reachable = await ping(5_000);
    if (!reachable) {
      app.log.error(
        "DATABASE_URL set but database is unreachable — refusing to start.",
      );
      throw new Error("Database unreachable");
    }

    try {
      await runMigrations();
      app.log.info("Database migrations applied");
    } catch (err) {
      app.log.error({ err }, "Database migrations failed");
      throw err;
    }

    const db = getDb();
    if (!db) throw new Error("Database connection missing after initialization");

    try {
      await hydrateStoreFromDb(db, app.store);
      app.log.info("In-memory store hydrated from database");
    } catch (err) {
      app.log.error({ err }, "Hydration from database failed");
      throw err;
    }

    const detach = attachPersistence({ db, log: app.log });

    app.decorate("db", db);

    app.addHook("onClose", async () => {
      detach();
      await closeDb();
    });
  },
  {
    name: "database",
    dependencies: ["store"],
  },
);

declare module "fastify" {
  interface FastifyInstance {
    db: Db | null;
  }
}
