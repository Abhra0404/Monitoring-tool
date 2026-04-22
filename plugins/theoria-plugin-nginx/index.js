/**
 * theoria-plugin-nginx — scrape nginx stub_status.
 *
 * The stub_status module emits exactly this format:
 *
 *   Active connections: 291
 *   server accepts handled requests
 *    16630948 16630948 31070465
 *   Reading: 6 Writing: 179 Waiting: 106
 */

"use strict";

const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

function fetchText(targetUrl, timeoutMs, insecure) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        method: "GET",
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        timeout: timeoutMs,
        rejectUnauthorized: !insecure,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ statusCode: res.statusCode, body });
        });
      },
    );
    req.on("timeout", () => { req.destroy(new Error(`timeout after ${timeoutMs}ms`)); });
    req.on("error", reject);
    req.end();
  });
}

function parseStubStatus(body) {
  const active = /Active connections:\s*(\d+)/i.exec(body);
  const counters = /\s*(\d+)\s+(\d+)\s+(\d+)/m.exec(body);
  const state = /Reading:\s*(\d+)\s+Writing:\s*(\d+)\s+Waiting:\s*(\d+)/i.exec(body);
  if (!active || !counters || !state) {
    throw new Error("unrecognized stub_status body");
  }
  return {
    active_connections: Number(active[1]),
    accepts_total: Number(counters[1]),
    handled_total: Number(counters[2]),
    requests_total: Number(counters[3]),
    reading: Number(state[1]),
    writing: Number(state[2]),
    waiting: Number(state[3]),
  };
}

async function check(config) {
  const url = config.url || "http://127.0.0.1/nginx_status";
  const started = Date.now();
  let res;
  try {
    res = await fetchText(url, 4500, !!config.insecure);
  } catch (err) {
    return { status: "down", latencyMs: Date.now() - started, detail: { error: err.message } };
  }
  if (!res.statusCode || res.statusCode >= 400) {
    return {
      status: "down",
      latencyMs: Date.now() - started,
      detail: { httpStatus: res.statusCode, body: res.body.slice(0, 200) },
    };
  }
  try {
    const metrics = parseStubStatus(res.body);
    return {
      status: "up",
      latencyMs: Date.now() - started,
      detail: { httpStatus: res.statusCode },
      metrics,
    };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - started,
      detail: { error: err.message, body: res.body.slice(0, 200) },
    };
  }
}

module.exports = { check };
