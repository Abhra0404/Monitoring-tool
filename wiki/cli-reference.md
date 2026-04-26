# CLI Reference

The `theoria-cli` package is the launcher and ops tool for Theoria.

```bash
npx theoria-cli [command] [options]
```

If installed globally (`npm install -g theoria-cli`), you can also call `theoria` directly.

## Commands at a glance

| Command | Purpose |
|---|---|
| `theoria-cli` (no args) | Start the server (default command) |
| `theoria-cli agent` | Run the bundled agent |
| `theoria-cli plugin install <pkg>` | Install a plugin from npm |
| `theoria-cli plugin list` | List installed plugins |
| `theoria-cli plugin remove <pkg>` | Remove a plugin |
| `theoria-cli plugin test <path>` | Run a plugin locally with mocked capabilities |
| `theoria-cli migrate` | Run pending Drizzle migrations and exit |
| `theoria-cli --version` | Print the CLI version |
| `theoria-cli --help` | Print help |

## Server (default command)

```bash
npx theoria-cli [options]
```

| Flag | Default | Description |
|---|---|---|
| `--port <n>` | `4000` | Server listen port |
| `--host <addr>` | `0.0.0.0` | Bind address |
| `--database-url <dsn>` | env `DATABASE_URL` | Postgres DSN; falls back to in-memory |
| `--redis-url <url>` | env `REDIS_URL` | Redis URL; required for HA |
| `--reset` | — | Wipe `~/.theoria/store.json` and start fresh (in-memory mode) |
| `--reset-database` | — | Drop and re-create Drizzle migrations table (destructive) |
| `--data-dir <path>` | `~/.theoria` | Override config + plugin install directory |
| `--log-level <level>` | `info` | Pino log level: `trace,debug,info,warn,error,fatal` |
| `--maintenance` | — | Start in maintenance mode (`MAINTENANCE_MODE=true`) |
| `--version` | — | Print version |
| `--help` | — | Print help |

Examples:

```bash
# First run on a homelab box — uses fallback store
npx theoria-cli

# Production server with Postgres + Redis
npx theoria-cli \
  --database-url "postgres://theoria:****@db:5432/theoria?sslmode=require" \
  --redis-url    "rediss://:****@redis:6380" \
  --port 4000

# Reset everything for a clean dev environment
npx theoria-cli --reset --port 4001
```

## Agent subcommand

```bash
npx theoria-cli agent [options]
```

| Flag | Env | Default | Description |
|---|---|---|---|
| `--url <url>` | `API_URL` | — | Theoria server base URL (required) |
| `--key <token>` | `API_KEY` | — | Per-server API key (required) |
| `--id <id>` | `SERVER_ID` | auto | Override server ID; auto-generated on first run |
| `--interval <ms>` | `INTERVAL_MS` | `5000` | Collection interval |
| `--name <label>` | `SERVER_NAME` | hostname | Display name in dashboard |
| `--docker` | `DOCKER=true` | off | Enable Docker container collection |
| `--docker-socket <path>` | `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |
| `--otel` | `OTEL=true` | off | Enable OTLP receiver on the agent |
| `--otel-port <n>` | `OTEL_PORT` | `4318` | OTLP HTTP port |
| `--insecure` | — | off | Skip TLS verification (testing only) |
| `--token <jwt>` | — | — | One-time enrolment token (auto-claims an API key) |

Examples:

```bash
# Standard agent
npx theoria-cli agent --url https://monitor.example.com --key tha_…

# With Docker collection
npx theoria-cli agent --url … --key … --docker

# Self-enrol via short-lived token from the dashboard
npx theoria-cli agent --url https://monitor.example.com --token eyJ…
```

The agent stores its persistent state at `~/.theoria/agent.json` (or `$DATA_DIR/agent.json`).

## Plugin commands

### `plugin install <pkg>`

```bash
npx theoria-cli plugin install theoria-plugin-mongodb
npx theoria-cli plugin install theoria-plugin-mongodb@1.2.0
npx theoria-cli plugin install ./local-plugin-dir
```

Validates `theoria-plugin.json`, installs into `~/.theoria/plugins/`, and signals the running server to reload (if any).

### `plugin list`

```bash
npx theoria-cli plugin list
```

Prints installed plugins and version.

### `plugin remove <pkg>`

```bash
npx theoria-cli plugin remove theoria-plugin-mongodb
```

Removes the package and refuses if any active instances exist (use the dashboard / API to delete instances first, or pass `--force`).

### `plugin test <path>`

```bash
npx theoria-cli plugin test ./theoria-plugin-rabbitmq \
  --config '{"url":"http://localhost:15672","username":"guest","password":"guest"}'
```

Runs one tick locally with stubbed capabilities. Useful during development.

## Migrate

```bash
npx theoria-cli migrate                     # apply pending migrations
npx theoria-cli migrate --dry-run            # print pending without applying
npx theoria-cli migrate --to <migration-id>  # migrate up to a specific version
```

Useful when you run migrations as a separate step (e.g. a Kubernetes Job before rolling out new pods).

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean shutdown |
| `1` | Uncaught exception during runtime |
| `2` | Invalid CLI usage |
| `10` | Database migration failed |
| `11` | Database unreachable |
| `12` | Redis unreachable (and required) |
| `20` | Port already in use |

## Environment variable precedence

CLI flags > environment variables > `~/.theoria/config.json` > defaults.
