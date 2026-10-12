# Shared settings for the Codespaces scripts. Source it; do not run it.
# Computes the public preview URL and database URL; prints nothing and never echoes secrets.

FLOWDECK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$FLOWDECK_ROOT/.codespace-data"
RUN_DIR="$STATE_DIR/run"
LOG_FILE="$RUN_DIR/flowdeck.log"
FLOWDECK_PORT=8080

# Codespaces sets CODESPACE_NAME and GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN in terminals. Lifecycle
# commands may start without them, so fall back to the two names (only) from the codespace's shared env file.
_fd_codespace_var() {
  local name="$1" value="${!1:-}" file=/workspaces/.codespaces/shared/.env
  if [ -z "$value" ] && [ -r "$file" ]; then
    value="$(grep -E "^${name}=" "$file" | head -n1 | cut -d= -f2- | tr -d '"'"'"'\r')"
  fi
  printf '%s' "$value"
}

_fd_name="$(_fd_codespace_var CODESPACE_NAME)"
_fd_domain="$(_fd_codespace_var GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN)"
if [ -n "${FLOWDECK_BASE_URL:-}" ]; then
  :
elif [ -n "$_fd_name" ] && [ -n "$_fd_domain" ]; then
  FLOWDECK_BASE_URL="https://${_fd_name}-${FLOWDECK_PORT}.${_fd_domain}"
else
  FLOWDECK_BASE_URL="http://localhost:${FLOWDECK_PORT}"
fi
unset _fd_name _fd_domain

export FLOWDECK_BASE_URL
export PORT="$FLOWDECK_PORT"
export HOST=0.0.0.0
# Only the Codespaces (or VS Code) port forwarder reaches this port, so trust its X-Forwarded-* headers:
# real client IPs for the login rate limit, and X-Forwarded-Host as a fallback for the WebSocket origin check.
export FLOWDECK_TRUST_PROXY=true
export FLOWDECK_DATA_DIR="$STATE_DIR/app"
export FLOWDECK_WEB_DIR="$FLOWDECK_ROOT/dist/web"
export NPM_CONFIG_UPDATE_NOTIFIER=false
export FLOWDECK_ADMIN_HINT="flowdeck admin you@example.com"

fd_load_database_url() {
  local pw_file="$STATE_DIR/secrets/postgres-password"
  [ -s "$pw_file" ] || return 1
  DATABASE_URL="postgres://flowdeck:$(cat "$pw_file")@db:5432/flowdeck"
  export DATABASE_URL
}
