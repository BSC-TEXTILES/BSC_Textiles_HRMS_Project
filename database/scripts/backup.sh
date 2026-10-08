#!/usr/bin/env bash
# BSC Textiles HRMS — Native MySQL Backup Script
# Usage: ./scripts/backup.sh [output_file]

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="${1:-$BACKUP_DIR/bsc_textiles_hrms_backup_${TIMESTAMP}.sql}"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-bsc_textiles_hrms}"

echo "📦 Creating logical MySQL backup of $DB_NAME..."
mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --default-character-set=utf8mb4 \
  "$DB_NAME" > "$OUTPUT_FILE"

echo "✔ Backup completed successfully: $OUTPUT_FILE"
