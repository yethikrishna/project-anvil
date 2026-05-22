#!/bin/sh
# Anvil HIPAA Backup Script
# Runs daily encrypted backups of PostgreSQL with S3 offsite upload.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-90}"
S3_URL="${S3_BACKUP_URL:-}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILE="anvil_backup_${TIMESTAMP}.sql.gz.gpg"

echo "[$(date)] Starting backup..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Dump PostgreSQL (all databases, compressed)
pg_dumpall --no-password | gzip | gpg --symmetric --cipher-algo AES256 --batch --passphrase "${BACKUP_ENCRYPTION_KEY:-anvil-backup-key-change-me}" > "${BACKUP_DIR}/${BACKUP_FILE}"

BACKUP_SIZE=$(stat -f%z "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null || echo "unknown")
echo "[$(date)] Backup created: ${BACKUP_FILE} (${BACKUP_SIZE} bytes)"

# Upload to S3 if configured
if [ -n "$S3_URL" ]; then
  echo "[$(date)] Uploading to S3..."
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}" "${S3_URL}/${BACKUP_FILE}" 2>/dev/null && echo "[$(date)] S3 upload complete." || echo "[$(date)] WARNING: S3 upload failed."
  elif command -v mc >/dev/null 2>&1; then
    mc cp "${BACKUP_DIR}/${BACKUP_FILE}" "${S3_URL}/${BACKUP_FILE}" 2>/dev/null && echo "[$(date)] S3 upload complete." || echo "[$(date)] WARNING: S3 upload failed."
  else
    echo "[$(date)] WARNING: No S3 CLI found (aws or mc). Skipping upload."
  fi
fi

# Prune old local backups
echo "[$(date)] Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "anvil_backup_*.sql.gz.gpg" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
echo "[$(date)] Backup complete."
