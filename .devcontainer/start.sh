#!/usr/bin/env bash
# postStartCommand: launch the Flowdeck supervisor in the background and return immediately,
# so creating or resuming the codespace never waits for npm install, the build or the server.
set -u
. "$(dirname "$0")/env.sh"
# The database container prepares .codespace-data for this user on its first start; wait briefly for it.
for _ in $(seq 1 60); do
  mkdir -p "$RUN_DIR" 2>/dev/null && [ -w "$RUN_DIR" ] && break
  sleep 1
done
if [ ! -w "$RUN_DIR" ]; then
  echo "Cannot write $RUN_DIR as $(id -un) (uid $(id -u)). The database container prepares .codespace-data;" >&2
  echo "rebuild the container (Command Palette: Codespaces: Rebuild Container). Your data is kept." >&2
  exit 1
fi
setsid nohup bash "$FLOWDECK_ROOT/.devcontainer/supervise.sh" >>"$LOG_FILE" 2>&1 </dev/null &
echo "Flowdeck is starting in the background. Run 'flowdeck status' or 'flowdeck logs' in a terminal."
