# Backup & Restore

Theoria's durable state lives in two places:

1. **Postgres** — users, servers, alert rules + history, plugin configs, and all time-series data
2. **`~/.theoria/`** — config, fallback JSON store (only when `DATABASE_URL` is unset), installed plugin packages

## What to back up

| Data | Source | Critical? |
|---|---|---|
| Users, API keys, alert rules | Postgres | Yes |
| Plugin configs | Postgres | Yes |
| Metric history | Postgres (TimescaleDB) | Optional (recoverable from agents on next tick, but historical data is lost) |
| Alert history | Postgres | Yes for compliance |
| `~/.theoria/config.json` | Filesystem | Yes |
| `~/.theoria/plugins/` | Filesystem | Optional (re-installable) |

## Postgres backups

Use `pg_dump` for logical backups or your provider's snapshot mechanism for physical backups.

### Logical (pg_dump)

```bash
pg_dump --format=custom --compress=9 \
  --file=theoria-$(date +%F).dump \
  "postgres://theoria:****@db:5432/theoria"
```

For TimescaleDB hypertables, plain `pg_dump` works. For very large hypertables, prefer the [TimescaleDB-specific backup utilities](https://docs.timescale.com/use-timescale/latest/backup-restore/) or pgBackRest.

A reference cron-friendly script is at [`deploy/scripts/backup.sh`](../../deploy/scripts/backup.sh):

```bash
0 2 * * * /opt/theoria/backup.sh >> /var/log/theoria-backup.log 2>&1
```

### Physical (managed Postgres)

Most managed offerings (RDS, Cloud SQL, Crunchy Bridge) take continuous WAL backups by default. Verify:

- Point-in-time recovery is enabled
- Retention covers your RPO
- A test restore is performed quarterly

## Filesystem backups

```bash
tar czf theoria-home-$(date +%F).tar.gz -C /home/node .theoria
```

In Kubernetes, snapshot the PVC backing `/home/node/.theoria` via your CSI driver.

## Restore

### Postgres logical restore

```bash
# 1. Stop Theoria so no writes happen during restore
kubectl scale deployment/theoria --replicas=0 -n theoria

# 2. Drop and recreate the database
psql "postgres://postgres:****@db:5432/postgres" \
  -c "DROP DATABASE theoria;" \
  -c "CREATE DATABASE theoria OWNER theoria;"

# 3. Apply the TimescaleDB extension
psql "postgres://theoria:****@db:5432/theoria" \
  -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# 4. Restore the dump
pg_restore --jobs=4 --no-owner \
  --dbname="postgres://theoria:****@db:5432/theoria" \
  theoria-2024-12-01.dump

# 5. Bring Theoria back up
kubectl scale deployment/theoria --replicas=2 -n theoria
```

### Filesystem restore

```bash
systemctl stop theoria
tar xzf theoria-home-2024-12-01.tar.gz -C /home/node
systemctl start theoria
```

## Migrating between hosts

1. Provision the new host with the same Theoria version.
2. Stop Theoria on the old host.
3. `pg_dump` from old → `pg_restore` to new.
4. Copy `~/.theoria/` to the new host.
5. Update agent endpoints (DNS swap or per-agent reconfiguration).
6. Start Theoria on the new host.

Agents reconnect automatically once DNS resolves to the new host.

## Verifying backups

A backup you haven't restored is a backup that doesn't exist. Quarterly drill:

1. Spin up a sandbox Theoria instance from the latest backup.
2. Confirm record counts: `SELECT count(*) FROM users; SELECT count(*) FROM servers; SELECT count(*) FROM alert_rules;`
3. Confirm a recent metric exists: `SELECT max(time) FROM metrics;`
4. Tear down the sandbox.

## RPO / RTO targets

Recommended starting points; tune to your environment:

| Target | Value |
|---|---|
| RPO (Postgres) | ≤ 5 min via WAL archiving |
| RPO (filesystem) | ≤ 24 h via daily snapshot |
| RTO | ≤ 30 min for full recovery |

Document your achieved values after a restore drill and revisit annually.
