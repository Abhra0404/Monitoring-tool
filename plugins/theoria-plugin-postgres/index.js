/**
 * theoria-plugin-postgres — health + basic metrics via `pg`.
 *
 * We open a Client (not a Pool) per check so the worker sandbox can tear
 * everything down after each run. For real observability at scale, run
 * this against a read-replica or a dedicated monitoring user.
 */

"use strict";

const { Client } = require("pg");

async function check(config) {
  const started = Date.now();
  const client = new Client({
    connectionString: config.connectionString,
    ssl: config.sslMode === "require" ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 6000,
    statement_timeout: 5000,
  });

  try {
    await client.connect();
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - started,
      detail: { error: err.message },
    };
  }

  try {
    // Ping.
    await client.query("SELECT 1");

    // Cluster-wide counters.
    const conns = await client.query(
      "SELECT state, count(*)::int AS n FROM pg_stat_activity WHERE state IS NOT NULL GROUP BY state",
    );
    const stats = await client.query(
      "SELECT coalesce(sum(xact_commit),0)::bigint AS commits, coalesce(sum(xact_rollback),0)::bigint AS rollbacks FROM pg_stat_database",
    );
    const maxConn = await client.query("SHOW max_connections");

    const byState = {};
    for (const row of conns.rows) byState[row.state] = row.n;

    return {
      status: "up",
      latencyMs: Date.now() - started,
      detail: {
        states: byState,
      },
      metrics: {
        active_connections: Number(byState.active || 0),
        idle_connections: Number(byState.idle || 0),
        max_connections: Number(maxConn.rows[0].max_connections),
        xact_commit_total: Number(stats.rows[0].commits),
        xact_rollback_total: Number(stats.rows[0].rollbacks),
      },
    };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - started,
      detail: { error: err.message },
    };
  } finally {
    try { await client.end(); } catch { /* swallow */ }
  }
}

module.exports = { check };
