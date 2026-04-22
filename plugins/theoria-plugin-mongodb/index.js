/**
 * theoria-plugin-mongodb — health + metrics via mongodb driver.
 */

"use strict";

const { MongoClient } = require("mongodb");

async function check(config) {
  const started = Date.now();
  const client = new MongoClient(config.uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 7000,
  });

  try {
    await client.connect();
  } catch (err) {
    try { await client.close(); } catch { /* swallow */ }
    return {
      status: "down",
      latencyMs: Date.now() - started,
      detail: { error: err.message },
    };
  }

  try {
    const admin = client.db("admin");
    await admin.command({ ping: 1 });
    const status = await admin.command({ serverStatus: 1 });

    return {
      status: "up",
      latencyMs: Date.now() - started,
      detail: {
        version: status.version,
        host: status.host,
        process: status.process,
      },
      metrics: {
        current_connections: Number(status.connections?.current) || 0,
        available_connections: Number(status.connections?.available) || 0,
        uptime_sec: Number(status.uptime) || 0,
        opcounters_query: Number(status.opcounters?.query) || 0,
        opcounters_insert: Number(status.opcounters?.insert) || 0,
        opcounters_update: Number(status.opcounters?.update) || 0,
        opcounters_delete: Number(status.opcounters?.delete) || 0,
      },
    };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - started,
      detail: { error: err.message },
    };
  } finally {
    try { await client.close(); } catch { /* swallow */ }
  }
}

module.exports = { check };
