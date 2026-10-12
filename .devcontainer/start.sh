#!/usr/bin/env bash
# Starts Flowdeck in the background on every codespace start. Returns immediately, so it never
# blocks codespace creation or startup. Safe to run again: it does nothing if Flowdeck is running.
set -uo pipefail
cd "$(dirname "$0")/.."
. .devcontainer/env.sh
mkdir -p "$FLOWDECK_DATA_DIR" 2>/dev/null || true

if flowdeck_running; then
  echo "Flowdeck is already running: $FLOWDECK_BASE_URL"
  exit 0
fi
if [ ! -f dist/server/index.js ] || [ ! -f dist/web/index.html ]; then
  echo "Flowdeck is not built yet. Run: bash .devcontainer/setup.sh  (then: bash .devcontainer/start.sh)"
  exit 0
fi

# The server waits for the database and applies pending migrations itself before listening.
setsid nohup node dist/server/index.js >>"$FLOWDECK_LOG" 2>&1 < /dev/null &
echo $! > "$FLOWDECK_PID"
disown || true
echo "Flowdeck is starting in the background at $FLOWDECK_BASE_URL"
echo "Log: $FLOWDECK_LOG   ·   Create your administrator: bash .devcontainer/create-admin.sh you@example.com"
