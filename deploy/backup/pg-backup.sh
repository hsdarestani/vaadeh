#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}

mkdir -p "$BACKUP_DIR"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for backups" >&2
  exit 1
fi

STAMP=$(date +"%Y%m%d-%H%M%S")
OUTPUT="$BACKUP_DIR/vaadeh-${STAMP}.dump"

echo "Creating Postgres backup at $OUTPUT"
pg_dump "$DATABASE_URL" -Fc -f "$OUTPUT"

echo "Pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -type f -name 'vaadeh-*.dump' -mtime +"${RETENTION_DAYS}" -print -delete

echo "Backup complete"
