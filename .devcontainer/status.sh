#!/usr/bin/env bash
# Shows whether Flowdeck is running and the address to open.
cd "$(dirname "$0")/.."
. .devcontainer/env.sh
if curl -fsS "http://127.0.0.1:${PORT}/readyz" >/dev/null 2>&1; then
  echo "Flowdeck is running. Open: $FLOWDECK_BASE_URL  (Ports tab → port ${PORT} → Open in Browser)"
else
  echo "Flowdeck is not responding yet. Start it: bash .devcontainer/start.sh   ·   Log: $FLOWDECK_LOG"
  tail -n 20 "$FLOWDECK_LOG" 2>/dev/null || true
fi
