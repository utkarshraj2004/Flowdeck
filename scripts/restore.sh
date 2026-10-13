#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh into this Docker Compose Flowdeck.
# Usage: scripts/restore.sh backups/flowdeck-YYYYMMDDTHHMMSSZ
# WARNING: replaces the current database and uploaded files.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="${1:?Usage: scripts/restore.sh <backup-directory>}"
[ -f "$DIR/db.dump" ] && [ -f "$DIR/uploads.tar.gz" ] || { echo "Not a Flowdeck backup: $DIR"; exit 1; }

echo "Verifying checksums…"
(cd "$DIR" && sha256sum -c SHA256SUMS)

if [ "${FLOWDECK_RESTORE_YES:-}" != "1" ]; then
  read -r -p "This replaces ALL current Flowdeck data with $DIR. Type 'restore' to continue: " answer
  [ "$answer" = "restore" ] || { echo "Cancelled."; exit 1; }
fi

docker compose up -d db
docker compose stop app
echo "Restoring database…"
docker compose exec -T db psql -U flowdeck -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS flowdeck WITH (FORCE)' -c 'CREATE DATABASE flowdeck OWNER flowdeck'
docker compose exec -T db pg_restore -U flowdeck -d flowdeck --no-owner --exit-on-error < "$DIR/db.dump"

echo "Restoring uploaded files…"
docker compose run --rm --no-deps -T --entrypoint sh app -c 'rm -rf /data/uploads && tar -C /data -xzf -' < "$DIR/uploads.tar.gz"

echo "Starting Flowdeck (pending migrations run automatically; a backup from a newer version is refused)…"
docker compose start app
for i in $(seq 1 60); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:8080/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "Restore complete."; exit 0
  fi
  sleep 2
done
echo "Flowdeck did not become ready; check: docker compose logs app"; exit 1
