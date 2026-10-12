#!/usr/bin/env bash
# Back up a Docker Compose Flowdeck: database dump + uploaded files + manifest.
# Usage: scripts/backup.sh [backup-root]      (default: ./backups)
# Run from the directory with docker-compose.yml. The app keeps running.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="${1:-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$ROOT/flowdeck-$STAMP"
mkdir -p "$OUT"

echo "Dumping database…"
docker compose exec -T db pg_dump -U flowdeck -d flowdeck --format=custom --no-owner > "$OUT/db.dump"

echo "Archiving uploaded files…"
docker compose exec -T app tar -C /data -czf - uploads > "$OUT/uploads.tar.gz"

SCHEMA="$(docker compose exec -T db psql -U flowdeck -d flowdeck -Atc 'SELECT max(version) FROM schema_migrations')"
VERSION="$(docker compose exec -T app node -p "require('/app/package.json').version")"
(cd "$OUT" && sha256sum db.dump uploads.tar.gz > SHA256SUMS)
cat > "$OUT/manifest.json" <<JSON
{
  "createdAt": "$STAMP",
  "flowdeckVersion": "$VERSION",
  "schemaVersion": $SCHEMA,
  "files": ["db.dump", "uploads.tar.gz"]
}
JSON
echo "Backup written to $OUT ($(du -sh "$OUT" | cut -f1)). Copy it to another machine or disk."
