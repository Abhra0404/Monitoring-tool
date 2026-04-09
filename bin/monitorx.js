#!/usr/bin/env node

/**
 * MonitorX CLI — Self-hosted system monitoring
 *
 * Usage:
 *   npx monitorx-cli              → Interactive setup + start
 *   npx monitorx-cli --port 8080
 *   npx monitorx-cli --mongo mongodb+srv://...
 *   npx monitorx-cli --reset      → Re-run first-time setup
 */

const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const crypto = require("crypto");
const os = require("os");

// ── Paths ────────────────────────────────────────────────────────────────
const PKG_DIR = path.resolve(__dirname, "..");
const SERVER_ENTRY = path.join(PKG_DIR, "server", "src", "index.js");
const CLIENT_BUILD = path.join(PKG_DIR, "client", "build");
const CONFIG_DIR = path.join(os.homedir(), ".monitorx");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// ── Colors ───────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

// ── CLI arg parsing ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--reset") flags.reset = true;
  else if (args[i] === "--port" && args[i + 1]) flags.port = args[++i];
  else if (args[i] === "--mongo" && args[i + 1]) flags.mongo = args[++i];
  else if (args[i] === "--help" || args[i] === "-h") {
    printHelp();
    process.exit(0);
  }
}

function printHelp() {
  console.log(`
${c.bold}${c.green}MonitorX${c.reset} — Self-hosted system monitoring

${c.bold}USAGE:${c.reset}
  npx monitorx-cli              Start MonitorX (interactive setup on first run)
  npx monitorx-cli --port 8080  Start on a specific port
  npx monitorx-cli --mongo URI  Use a specific MongoDB connection string
  npx monitorx-cli --reset      Re-run first-time setup

${c.bold}REQUIREMENTS:${c.reset}
  • Node.js 18+
  • MongoDB (local or remote, e.g. MongoDB Atlas free tier)
`);
}

// ── Readline helper ─────────────────────────────────────────────────────
function ask(question, defaultValue) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const prompt = defaultValue
    ? `${question} ${c.dim}(${defaultValue})${c.reset}: `
    : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

// ── Config management ───────────────────────────────────────────────────
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    }
  } catch {}
  return null;
}

function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ── Get local IP ────────────────────────────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

// ── Open browser ────────────────────────────────────────────────────────
function openBrowser(url) {
  try {
    if (process.platform === "darwin") execSync(`open "${url}"`);
    else if (process.platform === "win32") execSync(`start "" "${url}"`);
    else execSync(`xdg-open "${url}" 2>/dev/null || true`);
  } catch {}
}

// ── Banner ──────────────────────────────────────────────────────────────
function printBanner(port) {
  const localIP = getLocalIP();
  console.log(`
${c.bold}${c.green}
  ███╗   ███╗ ██████╗ ███╗   ██╗██╗████████╗ ██████╗ ██████╗ ██╗  ██╗
  ████╗ ████║██╔═══██╗████╗  ██║██║╚══██╔══╝██╔═══██╗██╔══██╗╚██╗██╔╝
  ██╔████╔██║██║   ██║██╔██╗ ██║██║   ██║   ██║   ██║██████╔╝ ╚███╔╝
  ██║╚██╔╝██║██║   ██║██║╚██╗██║██║   ██║   ██║   ██║██╔══██╗ ██╔██╗
  ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║   ██║   ╚██████╔╝██║  ██║██╔╝ ██╗
  ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
${c.reset}
  ${c.bold}Dashboard:${c.reset}   ${c.cyan}http://localhost:${port}${c.reset}
  ${c.bold}Network:${c.reset}     ${c.cyan}http://${localIP}:${port}${c.reset}
  ${c.bold}Health:${c.reset}      ${c.cyan}http://localhost:${port}/health${c.reset}

${c.dim}─────────────────────────────────────────────────────────${c.reset}

  ${c.bold}Quick Start:${c.reset}
   ${c.dim}1.${c.reset} Open the dashboard and ${c.green}sign up${c.reset}
   ${c.dim}2.${c.reset} Go to ${c.green}Settings${c.reset} → copy your ${c.yellow}API Key${c.reset}
   ${c.dim}3.${c.reset} On each server you want to monitor, install the agent:

      ${c.yellow}npm install -g monitorx-agent${c.reset}   ${c.dim}(or clone the repo)${c.reset}

      ${c.dim}Create .env with:${c.reset}
      ${c.magenta}API_KEY=${c.reset}${c.dim}<your-api-key>${c.reset}
      ${c.magenta}API_URL=${c.reset}${c.cyan}http://${localIP}:${port}${c.reset}
      ${c.magenta}SERVER_ID=${c.reset}${c.dim}my-server-name${c.reset}

${c.dim}─────────────────────────────────────────────────────────${c.reset}
  ${c.dim}Press Ctrl+C to stop${c.reset}
`);
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}${c.green}MonitorX${c.reset} ${c.dim}v1.0.0${c.reset}\n`);

  // ── Verify server entry exists ──
  if (!fs.existsSync(SERVER_ENTRY)) {
    console.error(`${c.red}✗ Server files not found at ${SERVER_ENTRY}${c.reset}`);
    console.error(`  This should not happen. Try reinstalling: npm install -g monitorx-cli`);
    process.exit(1);
  }

  // ── Load or create config ──
  let config = flags.reset ? null : loadConfig();

  if (!config) {
    console.log(`${c.bold}First-time setup${c.reset} ${c.dim}(config saved to ~/.monitorx/config.json)${c.reset}\n`);

    const mongoUri = flags.mongo || await ask(
      `${c.cyan}?${c.reset} MongoDB URI`,
      "mongodb://localhost:27017/monitorx"
    );

    const port = flags.port || await ask(
      `${c.cyan}?${c.reset} Port`,
      "4000"
    );

    const jwtSecret = crypto.randomBytes(32).toString("hex");

    config = {
      mongoUri,
      port: Number(port),
      jwtSecret,
      createdAt: new Date().toISOString(),
    };

    saveConfig(config);
    console.log(`\n${c.green}✓${c.reset} Config saved to ${c.dim}~/.monitorx/config.json${c.reset}`);
  } else {
    if (flags.port) config.port = Number(flags.port);
    if (flags.mongo) config.mongoUri = flags.mongo;
    console.log(`${c.dim}Using saved config from ~/.monitorx/config.json${c.reset}`);
  }

  // ── Start the server ──
  console.log(`\n${c.cyan}▸${c.reset} Starting MonitorX server...`);

  const serverProcess = spawn("node", [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(config.port),
      MONGO_URI: config.mongoUri,
      JWT_SECRET: config.jwtSecret,
      CLIENT_BUILD_PATH: CLIENT_BUILD,
    },
    stdio: "pipe",
  });

  let serverReady = false;

  serverProcess.stdout.on("data", (data) => {
    const line = data.toString().trim();
    if (!line) return;

    if (line.includes("Server running") && !serverReady) {
      serverReady = true;
      printBanner(config.port);
      setTimeout(() => openBrowser(`http://localhost:${config.port}`), 800);
    } else if (line.includes("DB connected")) {
      console.log(`  ${c.green}✓${c.reset} ${line}`);
    } else if (line.includes("DB connection error")) {
      console.error(`  ${c.red}✗${c.reset} ${line}`);
      console.error(`  ${c.dim}Check your MongoDB URI: ${config.mongoUri}${c.reset}`);
    } else if (!line.includes("Server running")) {
      console.log(`  ${c.dim}${line}${c.reset}`);
    }
  });

  serverProcess.stderr.on("data", (data) => {
    const line = data.toString().trim();
    if (line) console.error(`  ${c.red}${line}${c.reset}`);
  });

  serverProcess.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n${c.red}Server exited with code ${code}${c.reset}`);
      process.exit(code);
    }
  });

  const cleanup = () => {
    console.log(`\n${c.dim}Stopping MonitorX...${c.reset}`);
    serverProcess.kill("SIGTERM");
    setTimeout(() => process.exit(0), 3000);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((err) => {
  console.error(`${c.red}Fatal error:${c.reset}`, err.message);
  process.exit(1);
});
