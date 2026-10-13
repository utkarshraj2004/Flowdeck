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

# Succeeds when Flowdeck can log in to PostgreSQL; otherwise prints why not (shown by 'flowdeck status').
db_ready() {
  local secrets="$STATE_DIR/secrets"
  if [ -d "$secrets" ] && { [ ! -r "$secrets" ] || [ ! -x "$secrets" ]; }; then
    echo "user $(id -un) (uid $(id -u)) cannot read .codespace-data/secrets (owned by uid $(stat -c %u "$secrets"))"
    return 1
  fi
  if ! fd_load_database_url; then
    echo "the database container has not created .codespace-data/secrets/postgres-password yet (is it running?)"
    return 1
  fi
  node -e '
    const c = new (require("pg").Client)({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
    c.connect().then(() => c.end()).then(() => process.exit(0), (e) => {
      const notRunning = "host \"db\" not found: the database container is not running (or keeps restarting: see .codespace-data/run/db.log)";
      const why = {
        ENOTFOUND: notRunning,
        EAI_AGAIN: notRunning,
        ECONNREFUSED: "PostgreSQL is not accepting connections (still starting, or failing: see .codespace-data/run/db.log)",
        "57P03": "PostgreSQL is starting up",
        "28P01": "PostgreSQL rejected the password in .codespace-data/secrets/postgres-password (the database container resets the role password from that file when it starts: rebuild the container)",
        "3D000": "the database \"flowdeck\" does not exist (the database container creates it when it starts: rebuild the container)",
      }[e.code] || "cannot connect: " + (e.code ? e.code + " " : "") + String(e.message).replace(/\s+/g, " ");
      console.log(why);
      process.exit(1);
    });' 2>&1 | tail -n 1
  return "${PIPESTATUS[0]}"
}

phase "waiting for the database"
waited=0
last=""
until why="$(db_ready)"; do
  if [ "$why" != "$last" ]; then phase "waiting for the database: $why"; last="$why"; fi
  sleep 2
  waited=$((waited + 2))
  if [ $((waited % 120)) -eq 0 ]; then
    echo "$(date -Is) still waiting for the database after $((waited / 60)) min: $why"
    if [ -s "$RUN_DIR/db.log" ]; then
      echo "  last lines of .codespace-data/run/db.log:"
      tail -n 5 "$RUN_DIR/db.log" | sed 's/^/    /'
    fi
  fi
done
fd_load_database_url # db_ready ran in a subshell; export DATABASE_URL here for the server
echo "$(date -Is) database is reachable"

delay=2
while true; do
  phase "running"
  echo "$(date -Is) starting Flowdeck at $FLOWDECK_BASE_URL"
  started=$(date +%s)
  node dist/server/index.js 9>&- & # the server must not hold the supervisor lock
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
