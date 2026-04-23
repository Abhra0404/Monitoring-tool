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
const SERVER_ENTRY = path.join(PKG_DIR, "server", "dist", "index.js");
const CLIENT_BUILD = path.join(PKG_DIR, "client", "build");
const CONFIG_DIR = path.join(os.homedir(), ".theoria");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// ── Version (read from package.json so banners stay in sync) ──────────
let VERSION = "0.0.0";
try {
  VERSION = require(path.join(PKG_DIR, "package.json")).version || VERSION;
} catch {}

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
  else if (flagArgs[i] === "--database-url" && flagArgs[i + 1]) flags.databaseUrl = flagArgs[++i];
  else if (flagArgs[i] === "--url" && flagArgs[i + 1]) flags.url = flagArgs[++i];
  else if (flagArgs[i] === "--key" && flagArgs[i + 1]) flags.key = flagArgs[++i];
  else if (flagArgs[i] === "--id" && flagArgs[i + 1]) flags.id = flagArgs[++i];
  else if (flagArgs[i] === "--token" && flagArgs[i + 1]) flags.token = flagArgs[++i];
  else if (flagArgs[i] === "--interval" && flagArgs[i + 1]) flags.interval = flagArgs[++i];
  else if (flagArgs[i] === "--help" || flagArgs[i] === "-h") {
    if (subcommand === "plugin") { continue; } // let plugin handler show its own help
    printHelp();
    process.exit(0);
  }
  else if (flagArgs[i] === "--version" || flagArgs[i] === "-v") {
    console.log(VERSION);
    process.exit(0);
  }
}

function printHelp() {
  console.log(`
${c.bold}${c.green}Θ Theoria${c.reset} — Self-hosted system monitoring

${c.bold}USAGE:${c.reset}
  ${c.bold}Server (dashboard):${c.reset}
  npx theoria-cli                      Start Theoria server + dashboard
  npx theoria-cli --port 8080          Start on a specific port
  npx theoria-cli --database-url <dsn> Use PostgreSQL/TimescaleDB backend
  npx theoria-cli --reset              Re-run first-time setup

  ${c.bold}Agent (remote monitoring):${c.reset}
  npx theoria-cli agent --url <server-url> --key <api-key>
  npx theoria-cli agent --url http://myserver:4000 --key abc123 --id web-server-1
  npx theoria-cli agent --token <onboarding-token>   ${c.dim}(zero-config onboarding)${c.reset}

  ${c.bold}Plugins:${c.reset}
  npx theoria-cli plugin list
  npx theoria-cli plugin install <npm-package>
  npx theoria-cli plugin remove <plugin-name>

${c.bold}AGENT OPTIONS:${c.reset}
  --url <url>        Server URL (required, e.g. http://your-server:4000)
  --key <key>        API key from Settings page (required)
  --id  <name>       Server identifier (defaults to hostname)
  --token <jwt>      Onboarding token from the dashboard (replaces --url/--key)
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
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
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
  // Use spawn with an argv array so the URL is never re-parsed by the shell.
  const { spawn } = require("child_process");
  try {
    if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    } else if (process.platform === "win32") {
      // On Windows, `start` is a cmd.exe builtin, not an exe. The empty
      // first "title" arg prevents start from interpreting the URL as one.
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    }
  } catch {}
}

// ── Banner ──────────────────────────────────────────────────────────────
function printBanner(port) {
  const localIP = getLocalIP();
  console.log(`
${c.bold}${c.green}
  ████████╗██╗  ██╗███████╗ ██████╗ ██████╗ ██╗ █████╗
  ╚══██╔══╝██║  ██║██╔════╝██╔═══██╗██╔══██╗██║██╔══██╗
     ██║   ███████║█████╗  ██║   ██║██████╔╝██║███████║
     ██║   ██╔══██║██╔══╝  ██║   ██║██╔══██╗██║██╔══██║
     ██║   ██║  ██║███████╗╚██████╔╝██║  ██║██║██║  ██║
     ╚═╝   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝
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
// Onboarding token helpers: a JWT-like string whose payload exposes the server
// URL so the agent knows where to redeem it.
function parseOnboardingToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token is not a valid JWT");
  let body;
  try {
    body = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Token payload is not valid JSON");
  }
  if (!body.url || !body.typ) throw new Error("Token missing url/typ claims");
  return body;
}

function httpPostJson(url, payload) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(payload);
    const mod = parsed.protocol === "https:" ? require("https") : require("http");
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data)); } catch { reject(new Error("invalid JSON response")); }
          } else {
            let msg = `HTTP ${res.statusCode}`;
            try { msg = JSON.parse(data).error || msg; } catch {}
            reject(new Error(msg));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("request timed out")));
    req.write(body);
    req.end();
  });
}

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
  console.log(`\n${c.bold}${c.green}Theoria Agent${c.reset} ${c.dim}v${VERSION}${c.reset}\n`);

  // Interactive prompts if flags not provided
  let url = flags.url;
  let key = flags.key;
  let id = flags.id || os.hostname();

  // Zero-config onboarding: --token fetches url + apiKey from the server.
  if (flags.token && (!url || !key)) {
    try {
      const decoded = parseOnboardingToken(flags.token);
      const verifyUrl = `${decoded.url.replace(/\/$/, "")}/api/auth/onboarding/verify`;
      console.log(`  ${c.dim}Redeeming onboarding token at ${verifyUrl}${c.reset}`);
      const result = await httpPostJson(verifyUrl, { token: flags.token });
      url = url || result.url;
      key = key || result.apiKey;
      if (result.serverId && !flags.id) id = result.serverId;
    } catch (err) {
      console.error(`\n${c.red}✗ Onboarding token rejected: ${err.message}${c.reset}`);
      process.exit(1);
    }
  }

  if (!url) {
    url = await ask(`${c.cyan}?${c.reset} Theoria server URL`, "http://localhost:4000");
  }
  if (!key) {
    key = await ask(`${c.cyan}?${c.reset} API key (from Settings page)`);
  }
  if (!flags.id && !flags.token) {
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

// ── Plugin subcommand ───────────────────────────────────────────────────
async function runPluginCommand() {
  const action = flagArgs[0];
  const pluginsDir = process.env.THEORIA_PLUGINS_DIR || path.join(CONFIG_DIR, "plugins");
  fs.mkdirSync(pluginsDir, { recursive: true, mode: 0o700 });
  const hostPkg = path.join(pluginsDir, "package.json");
  if (!fs.existsSync(hostPkg)) {
    fs.writeFileSync(
      hostPkg,
      JSON.stringify({ name: "theoria-plugin-host", version: "0.0.0", private: true }, null, 2),
    );
  }

  if (!action || action === "help" || action === "--help" || action === "-h") {
    console.log(`
${c.bold}${c.green}Θ Theoria Plugin${c.reset} — manage Theoria plugins

${c.bold}USAGE:${c.reset}
  npx theoria-cli plugin list                      List installed plugins
  npx theoria-cli plugin install <npm-package>     Install a plugin from npm
  npx theoria-cli plugin remove <plugin-name>      Uninstall a plugin
  npx theoria-cli plugin dir                       Show plugins directory

Plugins are installed into: ${c.dim}${pluginsDir}${c.reset}
`);
    return;
  }

  if (action === "dir") {
    console.log(pluginsDir);
    return;
  }

  if (action === "list") {
    const nodeModules = path.join(pluginsDir, "node_modules");
    if (!fs.existsSync(nodeModules)) {
      console.log(`${c.dim}No plugins installed.${c.reset}`);
      return;
    }
    const entries = [];
    for (const name of fs.readdirSync(nodeModules)) {
      if (name.startsWith(".")) continue;
      if (name.startsWith("@")) {
        for (const sub of fs.readdirSync(path.join(nodeModules, name))) {
          entries.push(path.join(nodeModules, name, sub));
        }
      } else {
        entries.push(path.join(nodeModules, name));
      }
    }
    const plugins = [];
    for (const dir of entries) {
      const manifestPath = path.join(dir, "theoria-plugin.json");
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        plugins.push({ name: m.name, version: m.version, type: m.type });
      } catch {
        // skip invalid
      }
    }
    if (plugins.length === 0) {
      console.log(`${c.dim}No Theoria plugins found.${c.reset}`);
      return;
    }
    console.log(`${c.bold}Installed plugins (${plugins.length}):${c.reset}\n`);
    for (const p of plugins) {
      console.log(`  ${c.green}${p.name}${c.reset} ${c.dim}v${p.version}${c.reset} · ${p.type}`);
    }
    return;
  }

  if (action === "install") {
    const pkg = flagArgs[1];
    if (!pkg) {
      console.error(`${c.red}✗ Missing package name${c.reset}`);
      console.error(`  Usage: npx theoria-cli plugin install <npm-package>`);
      process.exit(1);
    }
    console.log(`${c.cyan}Installing ${pkg} into ${pluginsDir}…${c.reset}`);
    try {
      execSync(`npm install ${JSON.stringify(pkg)} --no-audit --no-fund --silent`, {
        cwd: pluginsDir,
        stdio: "inherit",
      });
      console.log(`${c.green}✓ Installed${c.reset}`);
    } catch (err) {
      console.error(`${c.red}✗ Install failed: ${err.message}${c.reset}`);
      process.exit(1);
    }
    return;
  }

  if (action === "remove" || action === "uninstall") {
    const name = flagArgs[1];
    if (!name) {
      console.error(`${c.red}✗ Missing plugin name${c.reset}`);
      process.exit(1);
    }
    try {
      execSync(`npm uninstall ${JSON.stringify(name)} --silent`, {
        cwd: pluginsDir,
        stdio: "inherit",
      });
      console.log(`${c.green}✓ Removed ${name}${c.reset}`);
    } catch (err) {
      console.error(`${c.red}✗ Remove failed: ${err.message}${c.reset}`);
      process.exit(1);
    }
    return;
  }

  console.error(`${c.red}✗ Unknown plugin action: ${action}${c.reset}`);
  console.error(`  Run: npx theoria-cli plugin --help`);
  process.exit(1);
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  // Handle plugin subcommand
  if (subcommand === "plugin") {
    return runPluginCommand();
  }
  // Handle agent subcommand
  if (subcommand === "agent") {
    return startAgent();
  }

  console.log(`\n${c.bold}${c.green}Theoria${c.reset} ${c.dim}v${VERSION}${c.reset}\n`);

  // ── Verify server entry exists ──
  if (!fs.existsSync(SERVER_ENTRY)) {
    console.error(`${c.red}✗ Server build not found at ${SERVER_ENTRY}${c.reset}`);
    console.error(`  Build it with: ${c.cyan}cd server && npm install && npm run build${c.reset}`);
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
      databaseUrl: flags.databaseUrl || process.env.DATABASE_URL || undefined,
      createdAt: new Date().toISOString(),
    };

    saveConfig(config);
    console.log(`\n${c.green}✓${c.reset} Config saved to ${c.dim}~/.theoria/config.json${c.reset}`);
  } else {
    if (flags.port) config.port = Number(flags.port);
    if (flags.databaseUrl) {
      config.databaseUrl = flags.databaseUrl;
      saveConfig(config);
    }
    console.log(`${c.dim}Using saved config from ~/.theoria/config.json${c.reset}`);
  }

  // ── Start the server ──
  console.log(`\n${c.cyan}▸${c.reset} Starting Theoria server...`);

  const serverEnv = {
    ...process.env,
    PORT: String(config.port),
    HOST: "0.0.0.0",
    JWT_SECRET: config.jwtSecret,
    CLIENT_BUILD_PATH: CLIENT_BUILD,
    NODE_ENV: process.env.NODE_ENV || "production",
    CORS_ORIGINS:
      process.env.CORS_ORIGINS || `http://localhost:${config.port},http://127.0.0.1:${config.port}`,
  };
  if (config.databaseUrl) serverEnv.DATABASE_URL = config.databaseUrl;

  const serverProcess = spawn("node", [SERVER_ENTRY], {
    env: serverEnv,
    stdio: "pipe",
  });

  let serverReady = false;

  function handleLine(line, stream) {
    if (!line) return;
    // Match ready signal from Fastify ("Theoria server running on ...").
    if (!serverReady && line.includes("Theoria server running")) {
      serverReady = true;
      printBanner(config.port);
      setTimeout(() => openBrowser(`http://localhost:${config.port}`), 800);
      return;
    }
    const prefix = stream === "err" ? c.red : c.dim;
    console.log(`  ${prefix}${line}${c.reset}`);
  }

  serverProcess.stdout.on("data", (data) => {
    data
      .toString()
      .split("\n")
      .forEach((l) => handleLine(l.trim(), "out"));
  });

  serverProcess.stderr.on("data", (data) => {
    data
      .toString()
      .split("\n")
      .forEach((l) => handleLine(l.trim(), "err"));
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
