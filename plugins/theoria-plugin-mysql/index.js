/**
 * theoria-plugin-mysql — health + metrics via mysql2.
 */

"use strict";

const mysql = require("mysql2/promise");

async function check(config) {
  const started = Date.now();
  let conn;
  try {
    conn = await mysql.createConnection({
      host: config.host || "127.0.0.1",
      port: Number(config.port) || 3306,
      user: config.user,
      password: config.password || "",
      database: config.database || undefined,
      ssl: config.ssl ? {} : undefined,
      connectTimeout: 6000,
    });
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - started,
      detail: { error: err.message },
    };
  }

  try {
    await conn.query("SELECT 1");
    const [rows] = await conn.query(
      "SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Queries','Uptime','Slow_queries')",
    );
    const [[versionRow]] = await conn.query("SELECT VERSION() AS v");

    const map = {};
    for (const r of rows) map[r.Variable_name] = r.Value;

    return {
      status: "up",
      latencyMs: Date.now() - started,
      detail: { version: versionRow.v },
      metrics: {
        threads_connected: Number(map.Threads_connected) || 0,
        threads_running: Number(map.Threads_running) || 0,
        queries_total: Number(map.Queries) || 0,
        uptime_sec: Number(map.Uptime) || 0,
        slow_queries_total: Number(map.Slow_queries) || 0,
      },
    };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - started,
      detail: { error: err.message },
    };
  } finally {
    try { await conn.end(); } catch { /* swallow */ }
  }
}

module.exports = { check };
