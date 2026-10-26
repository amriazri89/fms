#!/usr/bin/env bash
# Runs ON THE SERVER as the "deploy" user. Called by GitHub Actions after upload.
#   1. point /var/www/fms/current at the new release (atomic)
#   2. restart the API (it creates/updates the DB schema itself on startup) and wait for it
#   3. if it doesn't come up -> switch back to the previous release and fail the job
#   4. keep only the newest $KEEP_RELEASES releases
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/fms}"
SERVICE="${SERVICE:-fms-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5000/}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"

RELEASE="${1:?Usage: activate.sh <release-name>}"
NEW="$APP_ROOT/releases/$RELEASE"

if [ ! -f "$NEW/api/Fms.Api.dll" ] || [ ! -f "$NEW/api/wwwroot/index.html" ]; then
  echo "!! Release $NEW is incomplete (missing Fms.Api.dll or wwwroot/index.html)" >&2
  exit 1
fi

PREVIOUS="$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)"

switch_to() {
  ln -sfn "$1" "$APP_ROOT/current.tmp"
  mv -Tf "$APP_ROOT/current.tmp" "$APP_ROOT/current"
}

restart_api() {
  sudo /usr/bin/systemctl restart "$SERVICE"
}

echo "==> Activating release $RELEASE"
switch_to "$NEW"
restart_api

# The app applies schema.sql and seeds before it starts listening,
# so a 200 here also means the database is reachable and up to date.
echo "==> Waiting for $HEALTH_URL"
healthy=false
for ((i = 1; i <= HEALTH_TIMEOUT; i++)); do
  if curl -fsS -o /dev/null --max-time 2 "$HEALTH_URL"; then
    echo "    up after ${i}s"
    healthy=true
    break
  fi
  sleep 1
done

if [ "$healthy" != "true" ]; then
  echo "!! App did not start. Last service logs:" >&2
  journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ] && [ "$PREVIOUS" != "$NEW" ]; then
    echo "==> Rolling back to $(basename "$PREVIOUS")" >&2
    switch_to "$PREVIOUS"
    restart_api
  fi
  exit 1
fi

# Clean up old releases (never the active one)
current_real="$(readlink -f "$APP_ROOT/current")"
mapfile -t all < <(find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d | sort)
for ((i = 0; i < ${#all[@]} - KEEP_RELEASES; i++)); do
  [ "${all[$i]}" = "$current_real" ] && continue
  rm -rf -- "${all[$i]}"
done

echo "==> Deployed $RELEASE ($(cat "$NEW/REVISION" 2>/dev/null || echo 'unknown revision'))"
