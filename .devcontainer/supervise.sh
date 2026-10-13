#!/usr/bin/env bash
# Keeps Flowdeck running inside the codespace: installs dependencies and builds when needed,
# waits for PostgreSQL, then runs the production server (which applies pending migrations on
# start) and restarts it if it exits. Only one copy runs at a time. Never drops or resets data.
set -u
. "$(dirname "$0")/env.sh"
mkdir -p "$RUN_DIR" "$FLOWDECK_DATA_DIR"

exec 9>"$RUN_DIR/supervisor.lock"
if ! flock -n 9; then
  echo "$(date -Is) supervisor already running"
  exit 0
fi
echo $$ >"$RUN_DIR/supervisor.pid"
phase() { echo "$1" >"$RUN_DIR/phase"; echo "$(date -Is) $1"; }
cd "$FLOWDECK_ROOT"

child=""
trap '[ -n "$child" ] && kill "$child" 2>/dev/null; wait "$child" 2>/dev/null; rm -f "$RUN_DIR/server.pid"; phase stopped; exit 0' TERM INT

phase "installing dependencies"
lock_hash="$(sha256sum package-lock.json | cut -c1-64)"
if [ ! -d node_modules ] || [ "$(cat "$RUN_DIR/npm.stamp" 2>/dev/null)" != "$lock_hash" ]; then
  until npm ci --no-audit --no-fund; do
    phase "npm ci failed; retrying in 30 s"; sleep 30
  done
  echo "$lock_hash" >"$RUN_DIR/npm.stamp"
fi

phase "building"
src_hash="$( (git rev-parse HEAD 2>/dev/null; git status --porcelain -- server web migrations package-lock.json vite.config.ts 2>/dev/null; git diff -- server web migrations 2>/dev/null) | sha256sum | cut -c1-64)"
if [ -e "$RUN_DIR/rebuild" ] || [ ! -f dist/server/index.js ] || [ ! -f dist/web/index.html ] || [ "$(cat "$RUN_DIR/build.stamp" 2>/dev/null)" != "$src_hash" ]; then
  until npm run build; do
    phase "build failed; fix the error, then run 'flowdeck restart --rebuild'"; sleep 60
  done
  echo "$src_hash" >"$RUN_DIR/build.stamp"
  rm -f "$RUN_DIR/rebuild"
fi

phase "waiting for the database"
until fd_load_database_url && node -e '
  const c = new (require("pg").Client)({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  c.connect().then(() => c.end()).then(() => process.exit(0), () => process.exit(1));' 2>/dev/null; do
  sleep 2
done

delay=2
while true; do
  phase "running"
  echo "$(date -Is) starting Flowdeck at $FLOWDECK_BASE_URL"
  started=$(date +%s)
  node dist/server/index.js &
  child=$!
  echo "$child" >"$RUN_DIR/server.pid"
  wait "$child"
  code=$?
  child=""
  rm -f "$RUN_DIR/server.pid"
  # Back off if the server keeps crashing quickly; reset after a healthy run.
  if [ $(( $(date +%s) - started )) -gt 60 ]; then delay=2; else delay=$(( delay < 60 ? delay * 2 : 60 )); fi
  phase "server exited ($code); restarting in ${delay} s"
  sleep "$delay"
done
