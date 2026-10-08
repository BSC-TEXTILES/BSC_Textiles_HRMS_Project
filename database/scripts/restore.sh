#!/usr/bin/env bash
# BSC Textiles HRMS — Native MySQL Restore Script
# Usage: ./scripts/restore.sh <backup_file.sql>

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Error: Backup file path required."
  echo "Usage: $0 <path_to_backup.sql>"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found at $BACKUP_FILE"
  exit 1
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-bsc_textiles_hrms}"

echo "📥 Restoring MySQL database $DB_NAME from $BACKUP_FILE..."
mysql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --default-character-set=utf8mb4 \
  "$DB_NAME" < "$BACKUP_FILE"

echo "✔ Restore completed successfully from $BACKUP_FILE"
