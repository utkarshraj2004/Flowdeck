#!/usr/bin/env bash
# Stops the background Flowdeck server (data is kept). Start it again with .devcontainer/start.sh
cd "$(dirname "$0")/.."
. .devcontainer/env.sh
if flowdeck_running && kill "$(cat "$FLOWDECK_PID")"; then
  rm -f "$FLOWDECK_PID"
  echo "Flowdeck stopped."
else
  echo "Flowdeck was not running."
fi
