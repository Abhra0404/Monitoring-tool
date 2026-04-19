const os = require("os");
const fs = require("fs");
const http = require("http");
const axios = require("axios");

// Support both .env file and CLI args / environment variables
try { require("dotenv").config(); } catch {}

// Parse CLI args: --url, --key, --id, --interval
const cliArgs = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--url" && argv[i + 1]) cliArgs.url = argv[++i];
  else if (argv[i] === "--key" && argv[i + 1]) cliArgs.key = argv[++i];
  else if (argv[i] === "--id" && argv[i + 1]) cliArgs.id = argv[++i];
  else if (argv[i] === "--interval" && argv[i + 1]) cliArgs.interval = argv[++i];
  else if (argv[i] === "--docker") cliArgs.docker = true;
}

const SERVER_ID = cliArgs.id || process.env.SERVER_ID || os.hostname();
const API_URL = cliArgs.url || process.env.API_URL || "http://localhost:4000";
const API_KEY = cliArgs.key || process.env.API_KEY;
const INTERVAL_MS = Number(cliArgs.interval || process.env.INTERVAL_MS) || 5000;
const DOCKER_ENABLED = cliArgs.docker || process.env.DOCKER === "true";
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || "/var/run/docker.sock";

console.log(`Agent starting for server: ${SERVER_ID}`);
console.log(`Sending metrics to: ${API_URL}`);
console.log(`Collection interval: ${INTERVAL_MS}ms`);
if (DOCKER_ENABLED) console.log(`Docker monitoring: enabled (${DOCKER_SOCKET})`);

if (!API_KEY) {
  console.error("ERROR: API_KEY not provided");
  console.error("Provide via CLI args or .env file:");
  console.error("  npx theoria-cli agent --url http://server:4000 --key <your-key>");
  console.error("  or set API_KEY in .env file");
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

// ── Docker container metrics (optional) ───────────────────────────────
function dockerApiGet(path) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(DOCKER_SOCKET)) {
      return reject(new Error("Docker socket not found"));
    }
    const req = http.get({ socketPath: DOCKER_SOCKET, path }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Invalid Docker API response")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(5000, () => { req.destroy(new Error("Docker API timeout")); });
  });
}

function calculateCpuPercent(stats) {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const numCpus = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
  if (systemDelta > 0 && cpuDelta >= 0) {
    return (cpuDelta / systemDelta) * numCpus * 100;
  }
  return 0;
}

async function collectDockerMetrics() {
  if (!DOCKER_ENABLED) return null;
  try {
    const containers = await dockerApiGet("/containers/json?all=true");
    const results = [];
    for (const c of containers) {
      const container = {
        containerId: c.Id?.slice(0, 12),
        name: (c.Names?.[0] || "").replace(/^\//, ""),
        image: c.Image,
        status: c.Status,
        state: c.State,
        restarts: 0,
        cpuPercent: 0,
        memUsage: 0,
        memLimit: 0,
        memPercent: 0,
        netRx: 0,
        netTx: 0,
      };

      // Only get stats for running containers
      if (c.State === "running") {
        try {
          const stats = await dockerApiGet(`/containers/${c.Id}/stats?stream=false`);
          container.cpuPercent = Math.round(calculateCpuPercent(stats) * 100) / 100;
          container.memUsage = stats.memory_stats?.usage || 0;
          container.memLimit = stats.memory_stats?.limit || 0;
          container.memPercent = container.memLimit > 0
            ? Math.round((container.memUsage / container.memLimit) * 10000) / 100
            : 0;
          // Network I/O
          const networks = stats.networks || {};
          for (const iface of Object.values(networks)) {
            container.netRx += iface.rx_bytes || 0;
            container.netTx += iface.tx_bytes || 0;
          }
        } catch {}
      }

      results.push(container);
    }
    return results;
  } catch {
    return null;
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

    // Collect Docker metrics if enabled
    const containers = await collectDockerMetrics();
    if (containers) {
      metrics.containers = containers;
    }

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
let stopping = false;
let activeTimeout = null;

async function loop() {
  if (stopping) return;
  await sendMetrics();
  if (stopping) return;
  activeTimeout = setTimeout(loop, INTERVAL_MS);
}

async function main() {
  // Prime CPU delta calculation
  getCpuPercent();
  getNetworkStats();
  await sleep(1000);

  console.log("Agent started. Collecting metrics...\n");

  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\nReceived ${signal}, shutting down...`);
    if (activeTimeout) clearTimeout(activeTimeout);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  loop();
}

main();