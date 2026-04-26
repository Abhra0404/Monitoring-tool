# Upgrades

Theoria follows [Semantic Versioning](https://semver.org/):

- **Patch (`x.y.Z`)** — bug fixes, no breaking changes, no migrations.
- **Minor (`x.Y.0`)** — additive features, backward-compatible APIs and schemas. Migrations may run automatically.
- **Major (`X.0.0`)** — breaking changes; consult the release notes and migration guide before upgrading.

## Pre-flight checklist

Before any production upgrade:

- [ ] Read the release notes for every version between current and target.
- [ ] Verify a recent backup exists and has been test-restored within the last quarter.
- [ ] Confirm agents are on a [compatible version](#agent-server-compatibility).
- [ ] Schedule a maintenance window for major upgrades.

## Performing an upgrade

### Docker / docker-compose

```bash
docker compose pull theoria
docker compose up -d theoria
```

Migrations run on container startup; the container exits non-zero if migrations fail, preventing the new version from accepting traffic.

### Helm

```bash
helm upgrade theoria ./charts/theoria \
  --namespace theoria \
  --set image.tag=v1.2.0
```

Rolling update: new pods start, run migrations, become ready, old pods terminate.

### CLI / npm

```bash
npm install -g theoria-cli@latest
npx theoria-cli --reset-database   # only for major upgrades when notes call for it
```

## Database migrations

Schema is managed by [Drizzle ORM](https://orm.drizzle.team). Migration files live in `server/src-new/db/migrations/` and are bundled into the published package by `server/scripts/copy-migrations.mjs`.

On startup, the server:

1. Connects to Postgres
2. Reads `__drizzle_migrations` to determine the current schema version
3. Applies any pending migration files in order
4. Records each one in `__drizzle_migrations`

If a migration fails, the process exits with a non-zero code and logs the failing SQL. Resolve the issue, then restart.

To preview migrations without applying:

```bash
DATABASE_URL=… npx theoria-cli migrate --dry-run
```

## Agent–server compatibility

Agents and the server use a versioned ingestion protocol. Compatibility window:

| Server version | Compatible agent versions |
|---|---|
| `1.x` | `1.x`, `0.9+` |
| `2.x` | `1.5+`, `2.x` |

Upgrade the server before agents. Agents detect server version via `/version` and degrade gracefully.

## Plugin compatibility

The plugin host API is versioned independently. Each plugin manifest declares the host versions it supports:

```json
{
  "engines": { "theoria": ">=1.0.0 <2.0.0" }
}
```

Plugins outside the supported range are loaded but disabled, and a warning surfaces in the dashboard.

## Rolling back

Stateful rollback is not safe across versions that include schema migrations. Two strategies:

### Docker / Kubernetes

Pin to the previous image tag and restart **only if no migrations were applied**:

```bash
docker compose down
docker compose up -d --pull always   # uses the version pinned in compose
```

If migrations did run, you must restore the database from the pre-upgrade backup.

### Pre-upgrade snapshot

Always take a snapshot before a major upgrade:

```bash
pg_dump --format=custom --file=pre-v2-upgrade.dump …
```

Keep it at least until you've verified the new version is stable.

## Major upgrade procedure

For `1.x → 2.x` (representative pattern):

1. Announce the maintenance window to stakeholders.
2. Take a fresh backup. Verify it.
3. Scale to a single replica (`replicaCount: 1` for Helm, single container for compose).
4. Stop ingestion temporarily by setting `MAINTENANCE_MODE=true` so agents continue buffering and don't see schema-mismatch errors.
5. Apply the upgrade.
6. Monitor logs for migration completion: `journalctl -u theoria | grep "migration applied"`.
7. Unset `MAINTENANCE_MODE` and scale back up.
8. Watch agent reconnect rate and ingestion lag for 15 min.

## Deprecation policy

Deprecated APIs are:

1. **Marked deprecated** in a minor release; new `Deprecation` and `Sunset` HTTP response headers are emitted on calls.
2. **Maintained** through the next major release.
3. **Removed** in the major release after the announcement.

Migration paths are documented in the release notes and added to the [Troubleshooting](../troubleshooting.md) page when broadly impactful.
