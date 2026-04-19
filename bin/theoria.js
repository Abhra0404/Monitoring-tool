#!/usr/bin/env node

/**
 * Theoria CLI — Self-hosted system monitoring
 *
 * Usage:
 *   npx theoria-cli              → Interactive setup + start
 *   npx theoria-cli --port 8080
 *   npx theoria-cli --reset      → Re-run first-time setup
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
const CONFIG_DIR = path.join(os.homedir(), ".theoria");
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
const subcommand = args[0] && !args[0].startsWith("-") ? args[0] : null;
const flagArgs = subcommand ? args.slice(1) : args;
const flags = {};
for (let i = 0; i < flagArgs.length; i++) {
  if (flagArgs[i] === "--reset") flags.reset = true;
  else if (flagArgs[i] === "--port" && flagArgs[i + 1]) flags.port = flagArgs[++i];
  else if (flagArgs[i] === "--url" && flagArgs[i + 1]) flags.url = flagArgs[++i];
  else if (flagArgs[i] === "--key" && flagArgs[i + 1]) flags.key = flagArgs[++i];
  else if (flagArgs[i] === "--id" && flagArgs[i + 1]) flags.id = flagArgs[++i];
  else if (flagArgs[i] === "--interval" && flagArgs[i + 1]) flags.interval = flagArgs[++i];
  else if (flagArgs[i] === "--help" || flagArgs[i] === "-h") {
    printHelp();
    process.exit(0);
  }
}

function printHelp() {
  console.log(`
${c.bold}${c.green}Theoria${c.reset} — Self-hosted system monitoring

${c.bold}USAGE:${c.reset}
  ${c.bold}Server (dashboard):${c.reset}
  npx theoria-cli                      Start Theoria server + dashboard
  npx theoria-cli --port 8080          Start on a specific port
  npx theoria-cli --reset              Re-run first-time setup

  ${c.bold}Agent (remote monitoring):${c.reset}
  npx theoria-cli agent --url <server-url> --key <api-key>
  npx theoria-cli agent --url http://myserver:4000 --key abc123 --id web-server-1

${c.bold}AGENT OPTIONS:${c.reset}
  --url <url>        Server URL (required, e.g. http://your-server:4000)
  --key <key>        API key from Settings page (required)
  --id  <name>       Server identifier (defaults to hostname)
  --interval <ms>    Collection interval in ms (default: 5000)

${c.bold}REQUIREMENTS:${c.reset}
  • Node.js 18+
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
  ${c.dim}1.${c.reset} Open the dashboard
  ${c.dim}2.${c.reset} Go to ${c.green}Settings${c.reset} → copy your ${c.yellow}API Key${c.reset}
   ${c.dim}3.${c.reset} On each remote server, run the agent:

      ${c.yellow}npx theoria-cli agent --url http://${localIP}:${port} --key <your-api-key>${c.reset}

      ${c.dim}Or with a custom server ID:${c.reset}
      ${c.yellow}npx theoria-cli agent --url http://${localIP}:${port} --key <key> --id my-server${c.reset}

${c.dim}─────────────────────────────────────────────────────────${c.reset}
  ${c.dim}Press Ctrl+C to stop${c.reset}
`);
}

// ── Agent mode ──────────────────────────────────────────────────────────
// The agent is a Go binary. We look for a pre-built binary shipped inside
// agent/bin/<goos>-<goarch>/theoria-agent, then fall back to agent/theoria-agent
// (host-built), and finally try `go run` if the Go toolchain is available.
function resolveAgentCommand() {
  const platformMap = { darwin: "darwin", linux: "linux", win32: "windows" };
  const archMap = { x64: "amd64", arm64: "arm64" };
  const goos = platformMap[process.platform];
  const goarch = archMap[process.arch];
  const ext = process.platform === "win32" ? ".exe" : "";

  const candidates = [
    goos && goarch && path.join(PKG_DIR, "agent", "bin", `${goos}-${goarch}`, `theoria-agent${ext}`),
    path.join(PKG_DIR, "agent", `theoria-agent${ext}`),
  ].filter(Boolean);

  for (const bin of candidates) {
    if (fs.existsSync(bin)) return { type: "binary", path: bin };
  }

  const goMod = path.join(PKG_DIR, "agent", "go.mod");
  if (fs.existsSync(goMod)) return { type: "go-run", dir: path.join(PKG_DIR, "agent") };

  return null;
}

async function startAgent() {
  console.log(`\n${c.bold}${c.green}Theoria Agent${c.reset} ${c.dim}v1.0.2${c.reset}\n`);

  // Interactive prompts if flags not provided
  let url = flags.url;
  let key = flags.key;
  let id = flags.id || os.hostname();

  if (!url) {
    url = await ask(`${c.cyan}?${c.reset} Theoria server URL`, "http://localhost:4000");
  }
  if (!key) {
    key = await ask(`${c.cyan}?${c.reset} API key (from Settings page)`);
  }
  if (!flags.id) {
    id = await ask(`${c.cyan}?${c.reset} Server ID`, os.hostname());
  }

  if (!url || !key) {
    console.error(`\n${c.red}✗ Both --url and --key are required${c.reset}`);
    console.error(`  Usage: npx theoria-cli agent --url http://your-server:4000 --key <api-key>`);
    process.exit(1);
  }

  const agent = resolveAgentCommand();
  if (!agent) {
    console.error(`${c.red}✗ Agent binary not found.${c.reset}`);
    console.error(`  Build it with: ${c.cyan}cd agent && go build -o theoria-agent ./cmd/agent${c.reset}`);
    process.exit(1);
  }

  console.log(`  ${c.bold}Server URL:${c.reset}  ${c.cyan}${url}${c.reset}`);
  console.log(`  ${c.bold}Server ID:${c.reset}   ${c.cyan}${id}${c.reset}`);
  console.log(`  ${c.bold}Interval:${c.reset}    ${c.dim}${flags.interval || 5000}ms${c.reset}`);
  console.log(`\n${c.cyan}▸${c.reset} Starting agent...\n`);

  const intervalArg = flags.interval ? `${flags.interval}ms` : undefined;
  const agentArgs = ["--url", url, "--key", key, "--id", id];
  if (intervalArg) agentArgs.push("--interval", intervalArg);

  let cmd;
  let args;
  if (agent.type === "binary") {
    cmd = agent.path;
    args = agentArgs;
  } else {
    cmd = "go";
    args = ["run", "./cmd/agent", ...agentArgs];
  }

  const agentProcess = spawn(cmd, args, {
    stdio: "inherit",
    cwd: agent.type === "go-run" ? agent.dir : undefined,
  });

  agentProcess.on("close", (code) => {
    process.exit(code || 0);
  });

  agentProcess.on("error", (err) => {
    console.error(`${c.red}✗ Failed to start agent: ${err.message}${c.reset}`);
    process.exit(1);
  });

  const cleanup = () => {
    console.log(`\n${c.dim}Stopping agent...${c.reset}`);
    agentProcess.kill("SIGTERM");
    setTimeout(() => process.exit(0), 3000);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  // Handle agent subcommand
  if (subcommand === "agent") {
    return startAgent();
  }

  console.log(`\n${c.bold}${c.green}Theoria${c.reset} ${c.dim}v1.0.2${c.reset}\n`);

  // ── Verify server entry exists ──
  if (!fs.existsSync(SERVER_ENTRY)) {
    console.error(`${c.red}✗ Server files not found at ${SERVER_ENTRY}${c.reset}`);
    console.error(`  This should not happen. Try reinstalling: npm install -g theoria-cli`);
    process.exit(1);
  }

  // ── Load or create config ──
  let config = flags.reset ? null : loadConfig();

  if (!config) {
    console.log(`${c.bold}First-time setup${c.reset} ${c.dim}(config saved to ~/.theoria/config.json)${c.reset}\n`);

    const port = flags.port || await ask(
      `${c.cyan}?${c.reset} Port`,
      "4000"
    );

    const jwtSecret = crypto.randomBytes(32).toString("hex");

    config = {
      port: Number(port),
      jwtSecret,
      createdAt: new Date().toISOString(),
    };

    saveConfig(config);
    console.log(`\n${c.green}✓${c.reset} Config saved to ${c.dim}~/.theoria/config.json${c.reset}`);
  } else {
    if (flags.port) config.port = Number(flags.port);
    console.log(`${c.dim}Using saved config from ~/.theoria/config.json${c.reset}`);
  }

  // ── Start the server ──
  console.log(`\n${c.cyan}▸${c.reset} Starting Theoria server...`);

  const serverProcess = spawn("node", [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(config.port),
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
    console.log(`\n${c.dim}Stopping Theoria...${c.reset}`);
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
