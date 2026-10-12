# Shared environment for the Codespace scripts. Source it: `. .devcontainer/env.sh`
# Works out the one public origin Flowdeck is served from, so setup links, cookies and WebSockets all match.
PORT="${PORT:-8080}"
# Codespaces also records its name and forwarding domain in a shared env file; read just those two keys
# if a lifecycle hook was started without them in its environment.
CS_ENV=/workspaces/.codespaces/shared/.env
if [ -z "${CODESPACE_NAME:-}" ] && [ -r "$CS_ENV" ]; then
  CODESPACE_NAME="$(sed -n 's/^CODESPACE_NAME=//p' "$CS_ENV" | tr -d '"' | head -n1)"
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN="$(sed -n 's/^GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=//p' "$CS_ENV" | tr -d '"' | head -n1)"
fi
if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  # The private forwarded-port address GitHub gives this codespace, e.g. https://<name>-8080.app.github.dev
  FLOWDECK_BASE_URL="https://${CODESPACE_NAME}-${PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  if [ "${CODESPACES:-}" = "true" ]; then
    echo "Warning: running in a codespace but CODESPACE_NAME is unknown; links will use localhost." >&2
    echo "Open a new terminal and run: bash .devcontainer/stop.sh && bash .devcontainer/start.sh" >&2
  fi
  # Plain dev container (VS Code locally): the port is forwarded to localhost.
  FLOWDECK_BASE_URL="${FLOWDECK_BASE_URL:-http://localhost:${PORT}}"
fi
export PORT FLOWDECK_BASE_URL
export HOST=0.0.0.0
export DATABASE_URL="${DATABASE_URL:-postgres://flowdeck:flowdeck@db:5432/flowdeck}"
export FLOWDECK_DATA_DIR="${FLOWDECK_DATA_DIR:-$HOME/flowdeck-data}"
export FLOWDECK_WEB_DIR="${FLOWDECK_WEB_DIR:-dist/web}"
export FLOWDECK_LOG="$FLOWDECK_DATA_DIR/flowdeck.log"
export FLOWDECK_PID="$FLOWDECK_DATA_DIR/flowdeck.pid"

# True only if the recorded PID is a live Flowdeck server (a stale PID file after a restart may point
# at an unrelated process, so the command line is checked too).
flowdeck_running() {
  local pid
  pid="$(cat "$FLOWDECK_PID" 2>/dev/null)" || return 1
  [ -n "$pid" ] && [ -r "/proc/$pid/cmdline" ] && tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q 'dist/server/index.js'
}
