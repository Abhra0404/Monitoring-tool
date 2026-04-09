const os = require("os");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();

const SERVER_ID = process.env.SERVER_ID || os.hostname();
const API_URL = process.env.API_URL || "http://localhost:5000";
const API_KEY = process.env.API_KEY;
const INTERVAL_MS = Number(process.env.INTERVAL_MS) || 5000;

console.log(`Agent starting for server: ${SERVER_ID}`);
console.log(`Sending metrics to: ${API_URL}`);
console.log(`Collection interval: ${INTERVAL_MS}ms`);

if (!API_KEY) {
  console.error("ERROR: API_KEY not found in .env file");
  console.error("Please add your API key to the .env file:");
  console.error("API_KEY=your-api-key-here");
  process.exit(1);
}

// ── CPU usage calculation (delta-based, not load average) ──────────────
let prevCpuTimes = null;

function getCpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  return { idle, total };
}

function getCpuPercent() {
  const curr = getCpuTimes();
  if (!prevCpuTimes) {
    prevCpuTimes = curr;
    return Math.min(100, os.loadavg()[0] / os.cpus().length * 100);
  }
  const idleDelta = curr.idle - prevCpuTimes.idle;
  const totalDelta = curr.total - prevCpuTimes.total;
  prevCpuTimes = curr;
  if (totalDelta === 0) return 0;
  return Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100);
}

// ── Network I/O (delta-based) ──────────────────────────────────────────
let prevNetStats = null;

function getNetworkStats() {
  const ifaces = os.networkInterfaces();
  // We just track bytes via /proc on Linux; on other OS, return null
  if (process.platform === "linux") {
    try {
      const lines = fs.readFileSync("/proc/net/dev", "utf8").split("\n");
      let rxBytes = 0;
      let txBytes = 0;
      for (const line of lines.slice(2)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 10) continue;
        const iface = parts[0].replace(":", "");
        if (iface === "lo") continue;
        rxBytes += parseInt(parts[1], 10) || 0;
        txBytes += parseInt(parts[9], 10) || 0;
      }
      return { rxBytes, txBytes, ts: Date.now() };
    } catch {
      return null;
    }
  }
  return null;
}

function getNetworkDelta() {
  const curr = getNetworkStats();
  if (!curr || !prevNetStats) {
    prevNetStats = curr;
    return { rxBytesPerSec: 0, txBytesPerSec: 0 };
  }
  const elapsed = (curr.ts - prevNetStats.ts) / 1000;
  const result = {
    rxBytesPerSec: elapsed > 0 ? (curr.rxBytes - prevNetStats.rxBytes) / elapsed : 0,
    txBytesPerSec: elapsed > 0 ? (curr.txBytes - prevNetStats.txBytes) / elapsed : 0,
  };
  prevNetStats = curr;
  return result;
}

// ── Disk usage ─────────────────────────────────────────────────────────
function getDiskUsage() {
  if (process.platform === "linux") {
    try {
      const stats = fs.statfsSync("/");
      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      return { diskTotal: total, diskFree: free };
    } catch {
      return { diskTotal: 0, diskFree: 0 };
    }
  }
  // macOS / fallback - use a rough calculation from os
  try {
    const stats = fs.statfsSync("/");
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    return { diskTotal: total, diskFree: free };
  } catch {
    return { diskTotal: 0, diskFree: 0 };
  }
}

// ── Collect all metrics ────────────────────────────────────────────────
function collectMetrics() {
  const cpuPercent = getCpuPercent();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const loadAvg = os.loadavg();
  const { diskTotal, diskFree } = getDiskUsage();
  const { rxBytesPerSec, txBytesPerSec } = getNetworkDelta();

  return {
    serverId: SERVER_ID,
    cpu: cpuPercent,
    totalMem,
    freeMem,
    uptime: os.uptime(),
    loadAvg1: loadAvg[0],
    loadAvg5: loadAvg[1],
    loadAvg15: loadAvg[2],
    diskTotal,
    diskFree,
    networkRx: rxBytesPerSec,
    networkTx: txBytesPerSec,
    cpuCount: os.cpus().length,
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    timestamp: Date.now(),
  };
}

// ── Retry-aware sender ─────────────────────────────────────────────────
let consecutiveErrors = 0;
const MAX_BACKOFF = 30000;

async function sendMetrics() {
  try {
    const metrics = collectMetrics();
    await axios.post(`${API_URL}/metrics`, metrics, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      timeout: 5000,
    });

    const memPct = ((metrics.totalMem - metrics.freeMem) / metrics.totalMem * 100).toFixed(1);
    console.log(
      `[${new Date().toISOString()}] CPU: ${metrics.cpu.toFixed(1)}% | Mem: ${memPct}% | Disk: ${((1 - metrics.diskFree / (metrics.diskTotal || 1)) * 100).toFixed(1)}% | Net: ↓${formatBytes(metrics.networkRx)}/s ↑${formatBytes(metrics.networkTx)}/s`
    );
    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors++;
    const backoff = Math.min(MAX_BACKOFF, INTERVAL_MS * Math.pow(2, consecutiveErrors));
    console.error(
      `[${new Date().toISOString()}] Send failed (attempt ${consecutiveErrors}): ${err.response?.data?.error || err.message} — retrying in ${(backoff / 1000).toFixed(0)}s`
    );
    await sleep(backoff - INTERVAL_MS);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes.toFixed(0)}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

// ── Main loop ──────────────────────────────────────────────────────────
async function main() {
  // Prime CPU delta calculation
  getCpuPercent();
  getNetworkStats();
  await sleep(1000);

  console.log("Agent started. Collecting metrics...\n");

  setInterval(sendMetrics, INTERVAL_MS);
}

main();