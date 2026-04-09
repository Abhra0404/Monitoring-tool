#!/usr/bin/env node

/**
 * MonitorX CLI — Jenkins-style self-hosted monitoring
 *
 * Usage:
 *   npx monitorx          → Interactive setup + start
 *   npx monitorx --port 8080
 *   npx monitorx --mongo mongodb+srv://...
 *   npx monitorx --reset  → Re-run first-time setup
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const crypto = require("crypto");
const os = require("os");

// ── Paths ────────────────────────────────────────────────────────────────
const ROOT_DIR = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT_DIR, "server");
const CLIENT_DIR = path.join(ROOT_DIR, "client");
const CONFIG_DIR = path.join(os.homedir(), ".monitorx");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// ── Colors (no deps) ────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  bg: "\x1b[48;2;13;17;23m",
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
  npx monitorx              Start MonitorX (interactive setup on first run)
  npx monitorx --port 8080  Start on a specific port
  npx monitorx --mongo URI  Use a specific MongoDB connection string
  npx monitorx --reset      Re-run first-time setup

${c.bold}WHAT HAPPENS:${c.reset}
  1. Installs dependencies (first run only)
  2. Builds the dashboard (first run only)
  3. Starts the server + dashboard on a single port
  4. Opens your browser to the dashboard

${c.bold}REQUIREMENTS:${c.reset}
  • Node.js 18+
  • MongoDB (local or remote)
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

// ── Dependency check ────────────────────────────────────────────────────
function depsInstalled(dir) {
  return fs.existsSync(path.join(dir, "node_modules"));
}

function clientBuilt() {
  return fs.existsSync(path.join(CLIENT_DIR, "build", "index.html"));
}

function runCmd(cmd, cwd, label) {
  console.log(`\n${c.cyan}▸${c.reset} ${label}...`);
  try {
    execSync(cmd, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "development" },
    });
    return true;
  } catch (err) {
    console.error(`${c.red}✗ Failed:${c.reset} ${label}`);
    return false;
  }
}

// ── Get local IP for agent instructions ─────────────────────────────────
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
    const platform = process.platform;
    if (platform === "darwin") execSync(`open "${url}"`);
    else if (platform === "win32") execSync(`start "" "${url}"`);
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
${c.bold}  Dashboard:${c.reset}   ${c.cyan}http://localhost:${port}${c.reset}
${c.bold}  Network:${c.reset}     ${c.cyan}http://${localIP}:${port}${c.reset}
${c.bold}  API:${c.reset}         ${c.cyan}http://localhost:${port}/api${c.reset}
${c.bold}  Health:${c.reset}      ${c.cyan}http://localhost:${port}/health${c.reset}

${c.dim}─────────────────────────────────────────────────────${c.reset}

${c.bold}  Quick Start:${c.reset}
   ${c.dim}1.${c.reset} Open the dashboard and ${c.green}sign up${c.reset}
   ${c.dim}2.${c.reset} Go to ${c.green}Settings${c.reset} → copy your ${c.yellow}API Key${c.reset}
   ${c.dim}3.${c.reset} On any machine you want to monitor:

      ${c.yellow}git clone https://github.com/Abhra0404/Monitoring-tool.git${c.reset}
      ${c.yellow}cd Monitoring-tool/agent${c.reset}
      ${c.yellow}npm install${c.reset}

      ${c.dim}Create agent/.env:${c.reset}
      ${c.magenta}API_KEY=${c.reset}${c.dim}<your-api-key>${c.reset}
      ${c.magenta}API_URL=${c.reset}${c.cyan}http://${localIP}:${port}${c.reset}
      ${c.magenta}SERVER_ID=${c.reset}${c.dim}my-server-name${c.reset}

      ${c.yellow}npm start${c.reset}

${c.dim}─────────────────────────────────────────────────────${c.reset}
${c.dim}  Press Ctrl+C to stop${c.reset}
`);
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}${c.green}MonitorX${c.reset} ${c.dim}v1.0.0${c.reset}\n`);

  // ── Load or create config ──
  let config = flags.reset ? null : loadConfig();

  if (!config) {
    console.log(`${c.bold}First-time setup${c.reset} ${c.dim}(saved to ~/.monitorx/config.json)${c.reset}\n`);

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
    // Allow CLI overrides even with saved config
    if (flags.port) config.port = Number(flags.port);
    if (flags.mongo) config.mongoUri = flags.mongo;
    console.log(`${c.dim}Using saved config from ~/.monitorx/config.json${c.reset}`);
  }

  // ── Install deps if needed ──
  if (!depsInstalled(SERVER_DIR)) {
    if (!runCmd("npm install", SERVER_DIR, "Installing server dependencies")) {
      process.exit(1);
    }
  }

  if (!depsInstalled(CLIENT_DIR)) {
    if (!runCmd("npm install", CLIENT_DIR, "Installing client dependencies")) {
      process.exit(1);
    }
  }

  // ── Build React client if needed ──
  if (!clientBuilt()) {
    console.log(`\n${c.cyan}▸${c.reset} Building dashboard (this only happens once)...`);
    const buildEnv = {
      ...process.env,
      REACT_APP_API_URL: "",  // Empty = same origin (single port)
      BUILD_PATH: path.join(CLIENT_DIR, "build"),
    };
    try {
      execSync("npm run build", {
        cwd: CLIENT_DIR,
        stdio: "inherit",
        env: buildEnv,
      });
      console.log(`${c.green}✓${c.reset} Dashboard built successfully`);
    } catch {
      console.error(`${c.red}✗ Dashboard build failed${c.reset}`);
      console.error(`  Try running manually: cd client && npm run build`);
      process.exit(1);
    }
  }

  // ── Start the server ──
  console.log(`\n${c.cyan}▸${c.reset} Starting MonitorX server...`);

  const serverEnv = {
    ...process.env,
    PORT: String(config.port),
    MONGO_URI: config.mongoUri,
    JWT_SECRET: config.jwtSecret,
  };

  const serverProcess = spawn("node", ["src/index.js"], {
    cwd: SERVER_DIR,
    env: serverEnv,
    stdio: "pipe",
  });

  let serverReady = false;

  serverProcess.stdout.on("data", (data) => {
    const line = data.toString().trim();
    if (line) {
      // Intercept the "Server running" message to print banner
      if (line.includes("Server running") && !serverReady) {
        serverReady = true;
        printBanner(config.port);
        // Open browser after a short delay
        setTimeout(() => openBrowser(`http://localhost:${config.port}`), 1000);
      }
      // Print DB connection and other server logs
      if (line.includes("DB connected")) {
        console.log(`  ${c.green}✓${c.reset} ${line}`);
      } else if (line.includes("DB connection error")) {
        console.error(`  ${c.red}✗${c.reset} ${line}`);
        console.error(`  ${c.dim}Check your MongoDB URI: ${config.mongoUri}${c.reset}`);
      } else if (!line.includes("Server running")) {
        console.log(`  ${c.dim}${line}${c.reset}`);
      }
    }
  });

  serverProcess.stderr.on("data", (data) => {
    const line = data.toString().trim();
    if (line) {
      console.error(`  ${c.red}${line}${c.reset}`);
    }
  });

  serverProcess.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n${c.red}Server exited with code ${code}${c.reset}`);
      process.exit(code);
    }
  });

  // Forward signals to server process
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
