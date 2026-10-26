#!/usr/bin/env bash
# Manual rollback. Run on the server as the "deploy" user:
#   bash /var/www/fms/current/deploy/rollback.sh              # go back one release
#   bash /var/www/fms/current/deploy/rollback.sh <release>    # go to a specific release
#
# NOTE: only the app code is switched. Columns/tables added by a newer schema.sql stay in the DB
# (schema.sql only ever adds, so older releases normally still work).
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/fms}"
SERVICE="${SERVICE:-fms-api}"

current="$(readlink -f "$APP_ROOT/current")"
mapfile -t all < <(find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d | sort)

if [ $# -ge 1 ]; then
  target="$APP_ROOT/releases/$1"
  [ -d "$target" ] || { echo "No such release: $1" >&2; exit 1; }
else
  target=""
  for d in "${all[@]}"; do
    [ "$d" = "$current" ] && break
    target="$d"
  done
  [ -n "$target" ] || { echo "No older release to roll back to." >&2; exit 1; }
fi

echo "Rolling back: $(basename "$current") -> $(basename "$target")"
ln -sfn "$target" "$APP_ROOT/current.tmp"
mv -Tf "$APP_ROOT/current.tmp" "$APP_ROOT/current"
sudo /usr/bin/systemctl restart "$SERVICE"
echo "Done."
echo "Available releases:"
for d in "${all[@]}"; do echo "  $(basename "$d")"; done
