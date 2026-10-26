#!/usr/bin/env bash
# Daily backup of the FMS database and uploaded receipts.
# Installed to /usr/local/bin/fms-backup.sh and run by cron as root at 02:00.
#
# Restore the DB:
#   gunzip -c /var/backups/fms/fms_db_YYYYMMDD_HHMMSS.sql.gz | sudo mysql fms
# Restore receipts:
#   sudo tar -xzf /var/backups/fms/fms_uploads_YYYYMMDD_HHMMSS.tar.gz -C /var/lib/fms
set -euo pipefail
umask 077

DB="fms"
DIR="/var/backups/fms"
UPLOADS_PARENT="/var/lib/fms"
KEEP_DAYS=14
stamp="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$DIR"

db_file="$DIR/${DB}_db_${stamp}.sql.gz"
mysqldump --single-transaction --quick --routines --triggers "$DB" | gzip > "$db_file.partial"
mv "$db_file.partial" "$db_file"

if [ -d "$UPLOADS_PARENT/uploads" ]; then
  tar -czf "$DIR/${DB}_uploads_${stamp}.tar.gz" -C "$UPLOADS_PARENT" uploads
fi

find "$DIR" -name "${DB}_*" -mtime +"$KEEP_DAYS" -delete

# Offsite copy (strongly recommended for finance data). Set up rclone once, then uncomment:
# rclone copy "$DIR" offsite:fms-backups --max-age 25h --quiet
