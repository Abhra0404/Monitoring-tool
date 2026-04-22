#!/usr/bin/env bash
# Theoria — database backup.
#
# Usage:
#   DATABASE_URL=postgres://... S3_BUCKET=my-backups ./backup.sh
#
# Env vars:
#   DATABASE_URL      Full Postgres URL (required).
#   BACKUP_DIR        Local dir for staging (default: /var/backups/theoria).
#   S3_BUCKET         Optional S3 bucket to upload into (aws-cli).
#   RETENTION_DAYS    Remove local dumps older than N days (default 14).
#
# Exit codes: 0 on success, 1 on any failure.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/theoria}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/theoria-$ts.sql.gz"

echo "[backup] dumping to $file"
pg_dump --format=plain --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$file"

size="$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file")"
echo "[backup] $(basename "$file") — ${size} bytes"

if [[ -n "${S3_BUCKET:-}" ]]; then
  echo "[backup] uploading to s3://$S3_BUCKET/"
  aws s3 cp "$file" "s3://$S3_BUCKET/$(basename "$file")" --only-show-errors
fi

echo "[backup] pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -name "theoria-*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[backup] done"
