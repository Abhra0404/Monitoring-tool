/**
 * theoria-plugin-redis — zero-dependency Redis health check.
 *
 * Speaks just enough RESP2 (inline commands + bulk-string reply) to run
 *   - AUTH <password>     (optional)
 *   - SELECT <db>         (optional)
 *   - PING
 *   - INFO                (stats + clients + memory sections)
 *
 * We do NOT bundle ioredis or node-redis — the less surface area inside
 * the sandboxed worker, the better.
 */

"use strict";

const net = require("node:net");
const tls = require("node:tls");

function buildCommand(args) {
  // RESP2 array-of-bulk-strings
  let out = `*${args.length}\r\n`;
  for (const a of args) {
    const s = String(a);
    out += `$${Buffer.byteLength(s, "utf8")}\r\n${s}\r\n`;
  }
  return Buffer.from(out, "utf8");
}

/**
 * Send pipelined commands, collect replies. Simple streaming parser that
 * handles simple strings (+OK), errors (-ERR), integers (:1), and bulk
 * strings ($-1 / $N\r\n<payload>\r\n). Enough for AUTH/SELECT/PING/INFO.
 */
function talk(socket, commands, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const replies = [];
    const targetCount = commands.length;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`redis timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    function onData(chunk) {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const parsed = parseOne(buf);
        if (!parsed) break;
        replies.push(parsed.value);
        buf = parsed.rest;
        if (replies.length >= targetCount) {
          clearTimeout(timer);
          socket.off("data", onData);
          socket.end();
          resolve(replies);
          return;
        }
      }
    }

    socket.on("data", onData);
    socket.once("error", (err) => { clearTimeout(timer); reject(err); });
    for (const cmd of commands) socket.write(buildCommand(cmd));
  });
}

function parseOne(buf) {
  if (buf.length < 3) return null;
  const type = String.fromCharCode(buf[0]);
  const nlIdx = buf.indexOf("\r\n");
  if (nlIdx === -1) return null;
  const line = buf.slice(1, nlIdx).toString("utf8");
  if (type === "+" || type === ":" || type === "-") {
    const val = type === "-" ? new Error(line) : (type === ":" ? Number(line) : line);
    return { value: val, rest: buf.slice(nlIdx + 2) };
  }
  if (type === "$") {
    const len = Number(line);
    if (len === -1) return { value: null, rest: buf.slice(nlIdx + 2) };
    const start = nlIdx + 2;
    const end = start + len;
    if (buf.length < end + 2) return null;
    return { value: buf.slice(start, end).toString("utf8"), rest: buf.slice(end + 2) };
  }
  // Arrays / other types — not needed for our commands.
  return null;
}

function parseInfo(text) {
  const out = {};
  if (typeof text !== "string") return out;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

async function check(config) {
  const host = config.host || "127.0.0.1";
  const port = Number(config.port) || 6379;
  const timeoutMs = 4500;
  const started = Date.now();

  const socket = await new Promise((resolve, reject) => {
    const opts = { host, port };
    const s = config.tls ? tls.connect(opts) : net.createConnection(opts);
    const t = setTimeout(() => { s.destroy(); reject(new Error("connect timeout")); }, timeoutMs);
    s.once(config.tls ? "secureConnect" : "connect", () => { clearTimeout(t); resolve(s); });
    s.once("error", (err) => { clearTimeout(t); reject(err); });
  });

  const commands = [];
  if (config.password) commands.push(["AUTH", config.password]);
  if (typeof config.db === "number" && config.db > 0) commands.push(["SELECT", config.db]);
  commands.push(["PING"]);
  commands.push(["INFO"]);

  let replies;
  try {
    replies = await talk(socket, commands, timeoutMs);
  } catch (err) {
    try { socket.destroy(); } catch {}
    return {
      status: "down",
      latencyMs: Date.now() - started,
      detail: { error: err.message },
    };
  }

  // First replies may be AUTH/SELECT OKs; the last is INFO's bulk string.
  for (const r of replies) {
    if (r instanceof Error) {
      return {
        status: "down",
        latencyMs: Date.now() - started,
        detail: { error: r.message },
      };
    }
  }

  const infoText = replies[replies.length - 1];
  const info = parseInfo(infoText);
  const latencyMs = Date.now() - started;

  return {
    status: "up",
    latencyMs,
    detail: {
      version: info.redis_version,
      role: info.role,
      uptime_sec: Number(info.uptime_in_seconds) || 0,
      db_keys: Object.keys(info)
        .filter((k) => k.startsWith("db"))
        .reduce((acc, k) => { acc[k] = info[k]; return acc; }, {}),
    },
    metrics: {
      connected_clients: Number(info.connected_clients) || 0,
      used_memory_bytes: Number(info.used_memory) || 0,
      commands_processed_total: Number(info.total_commands_processed) || 0,
      keyspace_hits: Number(info.keyspace_hits) || 0,
      keyspace_misses: Number(info.keyspace_misses) || 0,
    },
  };
}

module.exports = { check };
